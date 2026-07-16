# o9k-init multi-CLI setup — Design

Date: 2026-07-16  
Status: approved (conversation)  
Related: `plugins/o9k-core/skills/o9k-init/SKILL.md`, `scripts/o9k-init.mjs`, `scripts/detect.mjs`

## Problem

`/o9k-init` today assumes Claude Code only: pillar install via `claude plugin
install`, hooks via Claude plugin `hooks.json`, memory via `hmem init` with a
Claude-centric path. Users routinely run Codex, Cursor CLI (`cursor-agent`),
OpenCode, and Hermes on the same machine. Those hosts need:

1. Detection of which CLIs are present
2. Shared o9k skills reachable from each host
3. **Full hook parity** with what o9k runs on Claude (core SessionStart +
   update-check, memory SessionStart + PreCompact)

## Goals

- Detect installed coding CLIs before asking; only wire what is present.
- Install o9k skills once to a canonical shared directory; link into each
  host’s skill path (symlinks). Cursor exception when the skill dir is
  IDE-owned.
- Wire the same o9k hook *intents* on every detected host, via host-native
  mechanisms.
- Keep memory backend pluggable: **public default remains hmem** until TIM
  1.0; prefer TIM when already detected on the machine; architecture must
  support flipping the default later without rewriting adapters.
- Idempotent re-runs; never delete non-o9k hooks or data.

## Non-goals

- Installing missing CLI tools (claude/codex/cursor/opencode/hermes binaries).
- Shipping o9k as a Codex/Hermes/Cursor plugin marketplace package.
- Making TIM the public recommended MCP before TIM 1.0 ships.
- Perfect Cursor skill parity if `skills-cursor` is read-only / IDE-synced
  (document Rules fallback instead of faking installs).
- Changing companion-bundle / rival-migration flow beyond host awareness.

## Decisions (from brainstorm)

| Topic | Choice |
|-------|--------|
| Overall approach | Adapter layer in o9k-core (not “delegate everything to hmem/tim”, not docs-only) |
| Skills | Canonical shared root + symlinks into host skill dirs |
| Hooks | Full Claude parity (intent C) on every detected host |
| Memory default (repo) | hmem until TIM 1.0; detect-and-prefer TIM if already present |
| Missing CLIs | Report only; do not install |

## Architecture

```
o9k-init detect
    → hosts[] + pillars + companions + rivals + memory backend
interview (existing + skip absent hosts)
execute
    → memory wire (hmem init / tim setup-agent as appropriate)
    → skills-sync (canonical → host skill dirs)
    → host-wire hooks (per detected host)
    → Claude pillars (claude plugin install) when Claude present
verify
    → snapshot Hosts: skills / hooks / mcp per host
```

### Shared skills

- **Canonical path:** `~/.agents/skills/o9k/` (under the emerging Agent Skills
  convention). Contents: copies or links of pillar skills the agent should
  see outside Claude plugins (`using-o9k`, `scout`, `dispatch`, `caveman`,
  `memory`, plus init/guide/update/stats as useful).
- **Host skill dirs (symlink targets):**
  - Claude: `~/.claude/skills/o9k-*` (optional if plugins already expose them)
  - Codex: `~/.codex/skills/o9k-*`
  - OpenCode: `~/.config/opencode/skills/o9k-*`
  - Hermes: `~/.hermes/skills/o9k-*` (or `hermes skills install` when that is
    the supported path)
  - Cursor: prefer a writable user skills path if one exists; else write
    `~/.cursor/rules/o9k-*.mdc` (or project `.cursor/rules/`) summarizing
    doctrine — do **not** write into IDE-managed `skills-cursor` without a
    confirmed writable API.

### Hook intents (Claude parity)

| Intent | Claude today | Required everywhere |
|--------|--------------|---------------------|
| Core session briefing | `o9k-core` SessionStart → `session-start.mjs` | yes |
| Update check | `o9k-core` SessionStart → `update-check.mjs` | yes (best-effort if host has no quiet inject path) |
| Memory session load | `o9k-memory` SessionStart → `session-start.mjs` | yes |
| Pre-compact checkpoint | `o9k-memory` PreCompact → `pre-compact.mjs` | yes (map to nearest host event) |

Shared Node scripts stay the source of truth. Host adapters are thin wrappers
that normalize stdin/env and invoke those scripts (or inject equivalent
context when the host cannot run Claude-shaped hook JSON).

### Per-host wiring

| Host | Detect | Skills | Hooks | MCP |
|------|--------|--------|-------|-----|
| Claude | `claude` + `~/.claude` | plugin + optional symlink | `~/.claude/settings.json` / plugin hooks | hmem/tim as today |
| Codex | `codex` + `~/.codex` | symlink → `~/.codex/skills/` | `~/.codex/hooks.json` + `~/.codex/hooks/` | `config.toml` / `tim setup-agent --host codex`; extend hmem later |
| Cursor | `cursor-agent` + `~/.cursor` | symlink or Rules fallback | `~/.cursor/hooks.json` + `~/.cursor/hooks/` | `~/.cursor/mcp.json` |
| OpenCode | `opencode` + `~/.config/opencode` | symlink → skills/ | TS plugin under `plugins/` mapping session/compact events | `opencode.json` |
| Hermes | `hermes` + `~/.hermes` | symlink or `hermes skills install` | `config.yaml` `hooks:` + `~/.hermes/agent-hooks/` | `tim setup-agent --host hermes`; hmem later |

### Event mapping

| Intent | Claude | Codex | Cursor | OpenCode | Hermes |
|--------|--------|-------|--------|----------|--------|
| Session briefing | SessionStart | SessionStart | sessionStart | plugin `session.created` | session-start / pre_llm_call (first turn) |
| Pre-compact | PreCompact | PreCompact if available, else documented fallback | preCompact | plugin compact/session event | nearest compact/session hook |
| Update check | SessionStart | SessionStart | sessionStart | session.created | session-start |

Exact Hermes/OpenCode event names are finalized at implementation against
current host docs; the table is the contract.

### Memory backend policy

1. Detect TIM vs hmem (existing companion probes).
2. If one is present → wire that one; do not install the other unless the
   user asks.
3. If none → recommend **hmem** (public default until TIM 1.0).
4. After TIM 1.0: flip recommendation in skill + registry note only;
   adapters already backend-agnostic via existing `backend.mjs` patterns.

### Idempotence & safety

- Own only entries marked as o9k (path prefix `o9k-`, comments, or known
  script paths under the plugin / adapter tree).
- Never remove third-party hooks.
- Export/migrate rules for rivals unchanged (Step 4 of current skill).
- Per-host failure does not abort other hosts; snapshot records `fail:…`.

## Repo layout (implementation targets)

| Path | Role |
|------|------|
| `plugins/o9k-core/scripts/detect.mjs` | add `detectHosts()` |
| `plugins/o9k-core/scripts/o9k-init.mjs` | print `Hosts:` section |
| `plugins/o9k-core/scripts/skills-sync.mjs` | canonical skills + symlinks / Cursor rules |
| `plugins/o9k-core/scripts/host-wire.mjs` (+ optional `hosts/*.mjs`) | per-host hook merge + verify |
| `plugins/o9k-core/hooks/adapters/` | Cursor/OpenCode/Hermes/Codex wrappers |
| `plugins/o9k-core/skills/o9k-init/SKILL.md` | multi-CLI steps in the guided flow |
| `plugins/o9k-core/compat/registry.json` | optional host metadata (bin, home, skillDir) |

OpenCode adapter may be a small committed `.ts` plugin that shells out to the
shared Node scripts.

## Skill flow changes (`o9k-init`)

1. Step 1 snapshot includes hosts.
2. Interview: no “install CLI” questions; mention undetected tools only if
   the user claims they use one (believe the user).
3. Execute order: git (if agreed) → memory backend → skills-sync → host-wire
   hooks → Claude pillar plugins → companions bundle.
4. Verify: re-run snapshot; report per-host matrix.

## Error handling

- Missing write permission on a skill dir → Rules fallback or warning line;
  continue.
- Host hook schema unknown / command fails → `hooks=fail:<reason>`; continue.
- `O9K_CORE_HOOK=off` and “backend already owns lifecycle” → silence (current
  behavior).
- Detection miss (“no”) is not proof of absence if the user says otherwise.

## Testing

- Unit: symlink idempotence; host event-map table; detectHosts fixtures
  (tmp PATH / tmp homes).
- Smoke: on a machine with all five CLIs, `o9k-init.mjs` lists five host
  rows.
- Manual: after wire, trigger each host’s session-start equivalent and
  confirm briefing inject / no crash.

No full test harness exists in-repo yet; add a minimal Node test script or
`node --test` files next to the new modules.

## Success criteria

- `/o9k-init` on a multi-CLI machine wires every detected host without
  requiring Claude-only steps for Codex/Cursor/OpenCode/Hermes.
- Shared skills appear (or Rules fallback on Cursor) after one agent-run.
- Hook intents from the parity table fire (or explicitly report unsupported
  with a follow-up task) on each wired host.
- Re-running `/o9k-init` does not duplicate hooks or destroy foreign config.
- Public docs/skill still recommend hmem until TIM 1.0; TIM-prefer path works
  when TIM is already installed.

## Follow-ups (out of band)

- Extend `hmem init --tools` for `codex` and `hermes` (upstream hmem).
- Flip public default to TIM after 1.0.
- Optional: publish OpenCode plugin to npm for `opencode plugin -g`.
- Optional: Hermes plugin package if skills-via-CLI is preferred over symlinks.

