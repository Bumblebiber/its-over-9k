---
name: roster
description: "Role-based model selection for multi-agent delegation. Use only when o9k-roster is installed and ~/.o9k/roster.json exists — before delegating to another model/CLI, on rate-limit errors (mark-limited), session-limit handoff, or cross-CLI mailbox runs (create/wait/answer/resume). Not for ordinary in-host search subagents (see dispatch path A). Selection is deterministic code — never reason about which model to use."
---

# roster — Who Does the Work

**Prerequisite:** this pillar is optional. If `~/.o9k/roster.json` is missing,
do not invent multi-agent flows — use `dispatch` path A (in-host RESULT
subagents) only. Users who never enabled the roster at `/o9k-init` should
never see these commands.

Model choice is config + code, not judgment. One primary role per task; the
role's chain IS the fallback mechanism. Never pick a model by reasoning —
that's how model-family favoritism happens.

Chain entries are **CLI×model** cells, not models alone:
- `"cursor:grok-4.5-high"` or `{ "cli": "hermes", "model": "deepseek-v4-pro" }`
  pins the pair
- bare `"claude-sonnet-5"` still works → uses `models[m].cli[0]`

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
| triager | classify a task, route it to a role |
| scout | codebase search |
| summarizer | digesting logs/diffs/docs |
| test-writer | tests after implementation |

## Commands

- **Delegate a task** (preferred — you never see the model choice):
  `$ROSTER dispatch --role implementer --prompt-file plan.md --dir <taskdir> [--run-id <id>]`
  Spawns the worker in tmux; report the printed session + attach command to the user.
  Pass `--run-id` when you created a mailbox run (see below).
- **Just ask who would do it:** `$ROSTER pick --role <role>`
- **You hit a rate-limit error from a provider:** `$ROSTER mark-limited <model|provider> --ttl 5h --reason rate-limit` — then continue with the next viable model.
- **Check limits:** `$ROSTER usage --check`
- **Refresh subscription usage cache:** `$ROSTER usage --refresh [--cli claude|codex|cursor]`
- **Refresh scores/prices (OpenRouter + AA indices):** see `roster-refresh`
  skill — `$ROSTER refresh [--apply]`

## Limit handoff protocol

When a limit warning arrives (hook injection, or your own `usage --check`):

- The **limit-watch hook** is scoped to the **active host CLI** (Claude sees
  `claude:*` windows only; Codex sees `codex:*`, etc.). Use `roster usage
  --check` for the global picture across all CLIs.

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

**Only when** you are spawning an **external** CLI worker in tmux under this
roster (not for in-host greps/summaries — those stay on `dispatch` path A).

1. `$RUNS create … --prompt-file …` (use `templates/worker-prompt.md` protocol; HEARTBEAT mandatory).
2. Start worker tmux (`$ROSTER dispatch … --run-id <id>` preferred) with that PROMPT.
3. Spawn an **internal cheap subagent** whose only job:
   - `$RUNS wait <runId>` (ONE blocking call — do not poll in a model loop)
   - Return the printed `status` (`question|done|failed|watching`) to the parent; then exit.
4. Parent on `question`: answer or ask human → `$RUNS answer <runId> --text "…"` → **respawn** the watcher (step 3).
5. Parent on `done`/`failed`: read RESULT; TIM/memory closeout only if semantically useful (no run-event spam).
6. After host reboot: `$RUNS resume` (systemd `o9k-resume.service`). If `REATTACH_WATCHER` exists, respawn watcher; do not double-dispatch if worker tmux lives.

Never use `claude --resume` as a live worker→parent callback.
Never LLM-poll every few seconds.
See `docs/MULTI-AGENT.md` and spec `docs/superpowers/specs/2026-07-17-cross-cli-run-resume-design.md`.
