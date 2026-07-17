# Multi-Agent Delegation with o9k-roster

How to run a multi-CLI agent team (Claude Code, Codex, Cursor, OpenCode,
Hermes) with role-based model selection.

## The pieces

- **Registry** (`~/.o9k/roster.json`): your models, CLIs, tiers, prices, and
  role chains as **CLI×model** cells (e.g. `cursor:grok-4.5-high`,
  `hermes:deepseek-v4-pro`). Yours to curate — o9k ships only the schema and
  example data.
- **`roster.mjs`**: deterministic selection. `pick` answers "who", `dispatch`
  spawns the worker in tmux, `mark-limited` reacts to rate-limit errors,
  `handoff` moves a dying session's work to a successor.
- **limit-watch hook**: warns the active agent at 90% usage, triggers the
  handoff protocol at 95%. Wired on all supported hosts by `/o9k-init`.
- **Scores refresh** (`roster refresh`): OpenRouter pulls Artificial Analysis
  indices + prices (incl. hosted open-weight for Hermes/OpenCode) into
  `~/.o9k/roster-scores.json`; `--apply` semiauto-promotes chain heads when
  score rises and cost does not. See skill `roster-refresh`.

## The standard pipeline (plan → implement → review)

A proven 3-phase shape for non-trivial code tasks:

1. **Plan** (`planner` role, frontier/high tier): challenge the spec first —
   classify every ambiguity as guess-safe or blocker; blockers go back to the
   human BEFORE any code is written. Then produce the plan.
2. **Implement** (`implementer` role, mid tier): execute the plan.
3. **Review** (`reviewer` role, frontier/high tier): fresh session, does NOT
   get the plan or the implementer's reasoning — findings only.
4. Loop 2–3 until approved, with a hard cycle cap (3 is a good default).

Each phase starts with `roster dispatch --role <phase-role>` — the phase
never chooses its own successor's model.

## Worker contract

Every dispatched worker prompt is self-contained and specifies: the task with
all paths/constraints inlined, the output artifact (e.g. a RESULT.md with
outcome, commits, test status, open questions marked BLOCKER), and what to do
on failure. The orchestrator reads the artifact, never the transcript.

## Session-limit handoff

The active agent gets warned by limit-watch (or its own `roster usage
--check` in degraded mode). At the handoff threshold it writes HANDOFF.md
(state, done, open, verification commands), runs `roster handoff`, reports
the tmux session + attach command, and stops. The successor starts with
"read HANDOFF.md and continue" — no work is lost to a hard limit.

## Cross-CLI runs (mailbox + resume)

For long-running workers that may outlive the parent session or survive a host
reboot, o9k tracks each run on disk under `~/.o9k/runs/<runId>/` with a
mailbox directory holding `STATUS`, `QUESTIONS.md`, `ANSWER.md`, `RESULT.md`,
`HEARTBEAT`, and `PROMPT`.

The parent spawns a cheap internal watcher that runs
`node …/runs.mjs wait <runId>` — one blocking OS wait that returns when the
mailbox reaches `question`, `done`, `failed`, or `watching`. On a question,
the parent answers via `runs.mjs answer` and **respawns** the watcher; it never
polls the mailbox itself.

After a host reboot, the systemd unit `o9k-resume.service` (see
`plugins/o9k-roster/systemd/`) runs `o9k-runs resume` agentlessly — no parent
process required. Parent re-attach is `manual` by default (no auto-tmux).

Worker prompts should use
`plugins/o9k-roster/templates/worker-prompt.md` — HEARTBEAT updates are
mandatory so stale runs can be detected.

Full design: `docs/superpowers/specs/2026-07-17-cross-cli-run-resume-design.md`
