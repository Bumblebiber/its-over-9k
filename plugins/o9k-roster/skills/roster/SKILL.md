---
name: roster
description: "Role-based model selection for multi-agent delegation. Use when o9k-roster is installed and ~/.o9k/roster.json exists — before delegating to another model/CLI, spawning planner/implementer/reviewer workers, on rate-limit errors (mark-limited), session-limit handoff, or cross-CLI mailbox runs (create/wait/answer/resume). Every external CLI tmux spawn must use runs create + dispatch --run-id + a cheap in-host watcher (runs wait); bare dispatch without a mailbox is incomplete. Not for ordinary in-host search subagents (see dispatch path A). Selection is deterministic code — never reason about which model to use."
---

# roster — Who Does the Work

**Prerequisite:** this pillar is optional *to install*. If `~/.o9k/roster.json` is
missing, do not invent multi-agent flows — use `dispatch` path A (in-host
RESULT subagents) only. Users who never enabled the roster at `/o9k-init`
should never see these commands.

Once roster **is** configured: model choice is config + code, not judgment —
and every external CLI worker spawn must complete the mailbox protocol (below).
One primary role per task; the role's chain IS the fallback mechanism. Never
pick a model by reasoning — that's how model-family favoritism happens.

Chain entries are **CLI×model** cells, not models alone:
- `"cursor:grok-4.5-high"` or `{ "cli": "hermes", "model": "deepseek-v4-pro" }`
  pins the pair
- bare `"claude-sonnet-5"` still works → uses `models[m].cli[0]`

### `cli_model` (logical id → CLI alias)

Roster keys are **logical** model ids (`claude-opus`, `claude-sonnet-5`). Some CLIs
reject those strings on `--model` and want short aliases (`opus`, `sonnet`). Set
`models.<id>.cli_model` — `buildCommand` substitutes `cli_model` for `{model}` in
`clis.*.cmd`, falling back to the roster key when omitted.

```json
"claude-opus": { "cli": ["claude"], "cli_model": "opus", "limit_windows": ["claude:5h", "claude:session", "claude:week"] }
```

### Headless Claude tmux workers (required cmd flag)

Workers spawned by `$ROSTER dispatch` run in detached tmux — no human on the
tty. **`clis.claude.cmd` must include `--dangerously-skip-permissions`** (before
`--model`). This is a **config requirement** for tmux workers, not a soft
optional: without it Claude blocks on permission prompts and the mailbox never
reaches `done`.

```json
"claude": { "cmd": ["claude", "--dangerously-skip-permissions", "--model", "{model}", "{prompt}"] }
```

### Burst windows — chain must have non-Claude fallbacks

`limits.handoff_at_burst` (default `0.8`) applies to **burst** windows
(`claude:5h`, `claude:session`). When usage on any applicable window is ≥
that threshold, `pick`/`dispatch` **skips** the model. A role chain that is
all-Claude with burst usage already ≥80% exhausts → exit non-zero, **dispatch
fails**. There is no mid-flight vibe-picking; the agent must not substitute its
own model.

**Legitimate fix:** extend `roles.<role>.chain` in `roster.json` with non-Claude
CLI×model pins the user curates — e.g. `cursor:composer-2.5`, `codex:gpt-5.6-sol`,
`hermes:deepseek-v4-pro`. Config-time chain extension, not runtime improvisation.
Planner/reviewer chains especially need cross-CLI tails when Claude burst is hot.

All commands below: `ROSTER="node <marketplace>/plugins/o9k-roster/scripts/roster.mjs"`
(in Claude Code: `node "${CLAUDE_PLUGIN_ROOT}/scripts/roster.mjs"` when this
plugin is active). Cross-CLI mailbox runs:
`RUNS="node <marketplace>/plugins/o9k-roster/scripts/runs.mjs"`.
No config yet → `$ROSTER init`, then tell the user to curate `~/.o9k/roster.json`.

## Roles

| Role | Use for |
|---|---|
| advisor | sign-off, architecture review, improvement suggestions (Fable only) |
| planner | spec grilling, plans, architecture |
| reviewer | code review (fresh session, never the implementer) |
| implementer | code changes following a plan |
| researcher | docs/web/codebase research |
| prompt-writer | writing worker/subagent prompts |
| frontend-designer | UI/UX work |
| scout | codebase search |
| summarizer | digesting logs/diffs/docs |
| test-writer | tests after implementation |

## Commands

- **Who would do it (no spawn):** `$ROSTER pick --role <role>`
- **Delegate a task (complete spawn — use this, not bare dispatch):**
  1. `$RUNS create … --prompt-file <prompt.md>` → note `runId`
  2. `$ROSTER dispatch --role <role> --prompt-file <prompt.md> --dir <taskdir> --run-id <runId>`
  3. Spawn a **cheap in-host watcher** (see `dispatch` Path B): only
     `$RUNS wait <runId>`, return status, exit
  4. Then you may tell the human the tmux attach string — never before step 3
- **Rate-limit:** `$ROSTER mark-limited <model|provider> --ttl 5h --reason rate-limit`
- **Limits:** `$ROSTER usage --check` / `$ROSTER usage --refresh [--cli claude|codex|cursor]`
- **Manual pass to a named model (human attaches):** skill `/o9k-pass-to` —
  `$ROSTER pass-to --model <name|cli:model> --dir "$PWD"` (requires `HANDOFF.md`)
- **Scores:** see `roster-refresh` — `$ROSTER refresh [--apply]`

`--run-id` is **required** whenever the parent needs a completion signal (always,
for Overseer / multi-phase pipelines). Omitting it is only for intentional
fire-and-forget attach-yourself debugging — not for delegated work. **Mailbox +
watcher are mandatory** for external CLI spawns — not "preferred", not "when you
remember". See Incomplete spawn below.

## Incomplete spawn (mailbox required)

**Required trio:** `$RUNS create` → `$ROSTER dispatch --run-id` → cheap in-host
watcher running `$RUNS wait`. All three, every external CLI tmux spawn.

If you ran `$ROSTER dispatch` and your next thought is "I'll check later" or
"tmux session = done" without a live `$RUNS wait` watcher → **STOP.** Add the
mailbox path before telling the human anything is running. The parent chat will
not be notified otherwise. See `dispatch` § Incomplete-spawn gate.

## Limit handoff protocol

When a limit warning arrives (hook injection, or your own `usage --check`):

- **≥ warn threshold:** converge — finish the current unit, commit, keep state checkpointable.
- **≥ handoff threshold:**
  1. Write `HANDOFF.md` in the working directory: current state, completed steps, open steps (exact), verification commands, relevant paths.
  2. `$ROSTER handoff --role <your current role> --dir "$PWD"`
  3. Report the tmux session name + attach command to the user.
  4. Stop working in this session.

## Degraded mode (hosts without a per-turn hook)

Claude Code and Hermes get limit-watch injected automatically. On Codex,
Cursor, and OpenCode the hook only fires at session start — so run
`$ROSTER usage --check` yourself at: task start, before every dispatch,
and after each phase transition.

## Chain exhausted?

`pick`/`dispatch` exit non-zero listing every skipped model and why. Report
that to the user verbatim and stop — never substitute your own model choice.

## Cross-CLI runs (mailbox watcher)

**Whenever** you spawn an **external** CLI worker in tmux under this roster
(planner/implementer/reviewer/… — not in-host greps; those stay on
`dispatch` path A):

1. `$RUNS create … --prompt-file …` — **auto-wraps** the file with
   `templates/worker-prompt.md` into `mailbox/PROMPT.md` (HEARTBEAT +
   `STATUS=done` closeout). Bare task prompts are fine as `--prompt-file`.
2. `$ROSTER dispatch … --run-id <id>` — **injects `mailbox/PROMPT.md`**, not the
   bare task file. (Passing only a bare `--prompt-file` without this link is how
   workers finish PLAN.md but leave the parent hanging on `runs wait`.)
3. Spawn an **internal cheap subagent** (see `templates/watcher-prompt.md`) whose only job:
   - `$RUNS wait <runId>` (ONE blocking call — do not poll in a model loop)
   - Return the printed `status` (`question|done|failed|watching`) to the parent; then exit.
4. Parent on `question`: answer or ask human → `$RUNS answer <runId> --text "…"` → **respawn** the watcher (step 3).
5. Parent on `done`/`failed`: read `mailbox/RESULT.md`; TIM/memory closeout only if semantically useful (no run-event spam).
6. After host reboot: `$RUNS resume` (systemd `o9k-resume.service`). If `REATTACH_WATCHER` exists, respawn watcher; do not double-dispatch if worker tmux lives.

**Stuck recovery:** task-dir has `PLAN.md` but `$RUNS classify <id>` still says
`watching` → worker skipped mailbox closeout. Write `mailbox/RESULT.md`, then
`$RUNS set-status <id> done` (or ask the worker to). Do not declare the phase
complete from cwd files alone.

Always invoke via `node …/roster.mjs` / `node …/runs.mjs` (not bare `./scripts/*.mjs`).

Never use `claude --resume` as a live worker→parent callback.
Never LLM-poll every few seconds.
Never treat "tmux session created" as "delegation complete."
See `docs/MULTI-AGENT.md` and spec `docs/superpowers/specs/2026-07-17-cross-cli-run-resume-design.md`.
