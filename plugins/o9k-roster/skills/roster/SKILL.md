---
name: roster
description: "Role-based model selection for multi-agent delegation. Use before delegating work to another model/CLI (pick the right worker by role), when a rate-limit error appears (mark-limited), or when a session-limit warning arrives (handoff protocol). Selection is deterministic code — never reason about which model to use."
---

# roster — Who Does the Work

Model choice is config + code, not judgment. One primary role per task; the
role's chain IS the fallback mechanism. Never pick a model by reasoning —
that's how model-family favoritism happens.

Chain entries are **CLI×model** cells, not models alone:
- `"cursor:grok-4.5-high"` or `{ "cli": "hermes", "model": "deepseek-v4-pro" }`
  pins the pair
- bare `"claude-sonnet-5"` still works → uses `models[m].cli[0]`

All commands below: `ROSTER="node <marketplace>/plugins/o9k-roster/scripts/roster.mjs"`
(in Claude Code: `node "${CLAUDE_PLUGIN_ROOT}/scripts/roster.mjs"` when this
plugin is active). No config yet → `$ROSTER init`, then tell the user to
curate `~/.o9k/roster.json`.

## Roles

| Role | Use for |
|---|---|
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
  `$ROSTER dispatch --role implementer --prompt-file plan.md --dir <taskdir>`
  Spawns the worker in tmux; report the printed session + attach command to the user.
- **Just ask who would do it:** `$ROSTER pick --role <role>`
- **You hit a rate-limit error from a provider:** `$ROSTER mark-limited <model|provider> --ttl 5h --reason rate-limit` — then continue with the next viable model.
- **Check limits:** `$ROSTER usage --check`
- **Refresh scores/prices (OpenRouter + AA indices):** see `roster-refresh`
  skill — `$ROSTER refresh [--apply]`

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
