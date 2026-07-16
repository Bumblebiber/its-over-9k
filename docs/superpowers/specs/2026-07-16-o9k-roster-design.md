# o9k-roster — Model Registry, Roles, Fallback Chains & Limit-Aware Handoff

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan

## Problem

Multi-agent setups (Claude Code, Codex, Cursor, OpenCode, Hermes) hard-code
model choices in prose ("Opus plans, Composer implements"). There is no
central place that knows which models exist per provider, what they cost,
what they are good at, and — critically — how close each provider session is
to its usage limit. Delegation decisions are therefore static, and a session
that hits its limit dies mid-task instead of handing off.

## Solution overview

A seventh o9k pillar, `o9k-roster`, providing:

1. A **model registry + role mapping** as user config (`~/.o9k/roster.json`).
   o9k ships the schema and a commented example; real models, prices, and
   chains live only in the user's config.
2. A **deterministic decision CLI** (`roster.sh`) — `pick`, `usage`,
   `mark-limited`, `handoff`. Model selection is code, not LLM reasoning.
3. A **limit-watch hook** wired into every supported host via the existing
   multi-CLI adapter layer, warning the active agent at ~90% usage and
   triggering a structured handoff at ~95%.
4. **Integrations**: o9k-init opt-in question, o9k-dispatch consults the
   roster before spawns, the Overseer worker pipeline consumes `roster pick`
   per phase.

## Components

### 1. Pillar layout

```
plugins/o9k-roster/
  skills/roster/SKILL.md      # roles, when to call roster pick, handoff protocol
  scripts/roster.sh           # decision CLI: pick / usage / mark-limited / handoff
  scripts/limit-watch.sh      # threshold check, prints warning text on stdout
  hooks/                      # Claude Code plugin hook wiring
  roster.example.json         # commented template, scaffolded by o9k-init
```

User state (never shipped, never committed):

- `~/.o9k/roster.json` — models, roles, chains, thresholds
- `~/.o9k/usage.json` — usage cache written by `roster usage` / `mark-limited`

### 2. Registry schema (`~/.o9k/roster.json`)

```json
{
  "models": {
    "claude-fable-5": {
      "provider": "anthropic",
      "tier": "frontier",
      "cli": ["claude"],
      "price": { "in": null, "out": null, "note": "per effort level" },
      "strengths": ["architecture", "review"],
      "weaknesses": ["cost"]
    },
    "gpt-5.6-sol": { "provider": "openai", "tier": "frontier", "cli": ["codex"] }
  },
  "roles": {
    "planner":     { "chain": ["claude-fable-5", "gpt-5.6-sol", "claude-opus"] },
    "implementer": { "chain": ["composer-2.5", "gpt-5.6-luna", "claude-sonnet-5"] }
  },
  "limits": { "warn_at": 0.90, "handoff_at": 0.95 }
}
```

- **Tiers:** `frontier` (Fable 5, GPT-5.6 Sol) / `high` (Opus, GPT-5.6 Terra,
  Grok 4.5 High) / `mid` (Composer 2.5, GPT-5.6 Luna, Sonnet 5, DeepSeek V4
  Pro) / `low` (Haiku, GPT-5.4 Mini, DeepSeek V4 Flash). Tier names are part
  of the schema; the model assignments above are example data.
- `price` supports per-effort-level breakdown where a provider has effort
  levels; a flat in/out pair otherwise.
- `cli` lists which host CLIs can reach the model — `pick` only returns
  models reachable from at least one installed CLI.

### 3. Roles (v1 set)

| Role | Default tier | Purpose |
|---|---|---|
| planner | frontier/high | spec grilling, plan, architecture |
| reviewer | frontier/high | code review, fresh session |
| implementer | mid | code changes following a plan |
| researcher | mid | docs/web/codebase research |
| prompt-writer | mid | writing worker/subagent prompts |
| frontend-designer | mid | UI/UX work, visually strong models |
| triager | low | classify task (SMALL/STANDARD), route to role |
| scout | low | codebase search ("where is X?") |
| summarizer | low | digest logs/diffs/docs |
| test-writer | mid | tests after implementation |

Explicitly deferred (YAGNI): security auditor, doc writer, debugger as its
own role (= implementer with a different prompt).

Each role has exactly one chain: preferred model first, fallbacks in order.
A task gets one primary role; the chain IS the fallback mechanism.

### 4. Decision CLI (`roster.sh`)

Deterministic shell script — no LLM reasoning in the selection path.

- `roster pick --role <r>` — walks the role's chain, skips models whose
  provider usage is ≥ `handoff_at` or which are marked unavailable in
  `usage.json`, prints the first viable candidate: model id, CLI, and the
  invocation form. Exit non-zero if the whole chain is exhausted.
- `roster usage [--refresh] [--check]` — collects per-provider usage into
  `~/.o9k/usage.json`. Sources are provider-specific: scripted queries where
  an API/local log exists; otherwise the cache only holds error-driven marks.
  `--check` additionally runs the same threshold logic as `limit-watch.sh`
  and prints its warning text — the entry point for hosts in degraded mode.
- `roster mark-limited <model|provider> --ttl <duration>` — called by any
  agent that observes a rate-limit error; marks the target unavailable until
  TTL expiry. This is the reliable path for subscription limits without a
  queryable API.
- `roster handoff --role <r> --dir <taskdir>` — picks a successor via the
  same chain logic, starts it **interactively inside a tmux session**
  (Hermes pattern — no `claude -p`; subscription plans do not cover
  non-interactive invocations), seeds it with the prompt "Read HANDOFF.md in
  this directory and continue the task", and prints the tmux session name
  plus the attach command (`tmux attach -t o9k-handoff-<slug>`).

### 5. Limit-watch + handoff protocol (multi-CLI)

The logic lives once in `scripts/limit-watch.sh`: read `usage.json` (cache
only, no API call per turn), compare against thresholds, print warning text
on stdout when crossed. Per-host wiring reuses the existing multi-CLI
adapter layer (`wire-*.mjs` fallback paths from the multi-CLI series):

| Host | Wiring |
|---|---|
| Claude Code | plugin hook (UserPromptSubmit/PostToolUse), stdout injected as context |
| Codex | `hooks.json` merge + bash wrapper under `~/.codex/hooks/` (existing `wireMode: hooks-json`) |
| Cursor | `hooks.json` (same fallback path as today) |
| Hermes | `config.yaml` shell hook (existing pattern) |
| OpenCode | file-drop plugin calling the same script |

**Degraded mode** for hosts without a per-turn hook event: the roster skill
(installed on all hosts) instructs the agent to run `roster usage --check`
at defined points — task start, before each spawn, after phase transitions.
Same data source, same protocol, coarser granularity.

**Thresholds and behavior:**

- ≥ `warn_at` (default 0.90): inject "⚠️ session limit at X% — prepare for
  handoff" so the agent starts converging toward a checkpointable state.
- ≥ `handoff_at` (default 0.95): inject the handoff instruction:
  1. Write `HANDOFF.md` into the working directory: current state, completed
     steps, open steps, verification commands, relevant file paths.
  2. Run `roster handoff --role <current role> --dir <cwd>`.
  3. Report the tmux session name and attach command to the user.
  4. Pause — do no further task work in this session.

One script, five wiring adapters, one degraded fallback. No host gets its
own copy of the logic.

### 6. Integrations

- **o9k-init:** new question "Use the multi-agent setup (roster)?" — on yes,
  scaffold `~/.o9k/roster.json` from `roster.example.json` and wire the
  limit-watch hook on every detected host.
- **o9k-dispatch:** SKILL.md addition — before spawning a subagent of
  non-trivial scope, consult `roster pick --role <matching role>` instead of
  defaulting to model inheritance.
- **Overseer pipeline:** each worker phase calls `roster pick` instead of
  hard-coded "Opus plans / Composer implements". The generic parts of the
  Overseer setup (3-phase pipeline concept, spec templates, worker contract)
  move into the pillar as documentation; the personal setup (Hermes spawn
  commands, cronjobs, TIM bindings) stays in `~/Overseer/`.
- **Multi-CLI distribution:** roster.sh + skill ship through the existing
  multi-CLI install infrastructure to Codex/Cursor/OpenCode; enduser
  propagation follows the existing `--refresh-hosts` rule.

### 7. Non-goals / v1 limits

- **Usage collection is best-effort.** Subscription limits (Anthropic Max,
  Cursor) mostly lack a clean API; error-driven `mark-limited` is the
  reliable path, percentage display exists only where a source does.
- **No dynamic price optimization.** v1 cost control is chain ordering,
  chosen by the user when editing roster.json — no runtime price comparison.
- **No automatic registry maintenance.** Keeping model entries current is
  manual or via the user's existing release-watcher cron; o9k does not ship
  a curated live model list.
- **No interactive-session takeover.** A successor never replaces the
  user's current terminal session; it always starts in its own tmux session.

## Error handling

- Chain exhausted (`pick`/`handoff` find no viable model): non-zero exit
  with a message listing what was skipped and why; the agent reports this to
  the user instead of guessing.
- Missing/corrupt `roster.json`: `roster.sh` fails loudly with a pointer to
  o9k-init; the limit-watch hook exits silently (no config = feature not
  enabled, never block the host).
- Stale `usage.json`: entries carry timestamps; marks expire via TTL. A
  missing usage file means "no known limits" — pick proceeds with chain
  order.

## Testing

- `roster.sh` gets a small self-check (`roster selftest` or `test_roster.sh`)
  against a fixture roster.json + usage.json: chain walking, TTL expiry,
  threshold crossing, exhausted-chain exit code.
- Hook wiring per host is verified by the existing multi-CLI verify path
  (same mechanism as the current hooks/skills refresh checks).
- Handoff is smoke-tested manually once per host family: seed a fake 96%
  usage.json, confirm warning injection, HANDOFF.md creation, and tmux
  session spawn.
