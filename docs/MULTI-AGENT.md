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
  handoff protocol at 95% (week/monthly windows) or 80% (burst windows —
  `claude:5h`/`claude:session` — see `handoff_at_burst`). Wired on all
  supported hosts by `/o9k-init`.
- **Scores refresh** (`roster refresh`): OpenRouter pulls Artificial Analysis
  indices + prices (incl. hosted open-weight for Hermes/OpenCode) into
  `~/.o9k/roster-scores.json`; `--apply` semiauto-promotes chain heads when
  score rises and cost does not. See skill `roster-refresh`.
- **Subscription usage collector** (optional): maintains multi-window
  `~/.o9k/usage.json` for Claude/Codex/Cursor; `pick` skips models when any
  applicable window is at/over its threshold (`handoff_at_burst` for
  5h/session windows, `handoff_at` otherwise). Refresh via
  `roster usage --refresh` or the
  adaptive watcher (`o9k-usage-watcher.sh`, cron, systemd user unit on Linux,
  or launchd agent on macOS — see `plugins/o9k-roster/systemd/` and
  `plugins/o9k-roster/launchd/`). Foreign installs: symlink the wrapper from
  the repo **or** set `O9K_ROSTER_SCRIPTS` in a systemd drop-in / plist
  `EnvironmentVariables`.

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

**Opt-in.** Only for installs with `~/.o9k/roster.json`. Single-agent users
stay on `dispatch` path A (in-host RESULT subagents) and can ignore this
section. Skills: `dispatch` (path B) + `roster` § Cross-CLI runs.

For long-running workers that may outlive the parent session or survive a host
reboot, o9k tracks each run on disk under `~/.o9k/runs/<runId>/` with a
mailbox directory holding `STATUS`, `QUESTIONS.md`, `ANSWER.md`, `RESULT.md`,
`HEARTBEAT`, and `PROMPT.md`.

The parent creates the run (`runs.mjs create`), starts the worker
(`roster dispatch --run-id …`), then spawns a cheap internal watcher that runs
`node …/runs.mjs wait <runId>` — one blocking OS wait that returns when the
mailbox reaches `question`, `done`, `failed`, or `watching`. On a question,
the parent answers via `runs.mjs answer` and **respawns** the watcher; it never
polls the mailbox itself.

After a host reboot, the systemd unit `o9k-resume.service` (Linux, see
`plugins/o9k-roster/systemd/`) or the launchd agent `com.o9k.resume.plist`
(macOS, see `plugins/o9k-roster/launchd/`) runs `o9k-runs resume`
agentlessly — no parent
process required. Parent re-attach is `manual` by default (no auto-tmux).

Worker prompts should use
`plugins/o9k-roster/templates/worker-prompt.md` — HEARTBEAT updates are
mandatory so stale runs can be detected.

Full design: `docs/superpowers/specs/2026-07-17-cross-cli-run-resume-design.md`
