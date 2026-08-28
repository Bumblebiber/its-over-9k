# Multi-Agent Delegation

Running a multi-CLI agent team (Claude Code, Codex, Cursor, OpenCode, Hermes)
with role-based model selection is **not** an o9k feature. It lives in the
standalone [team-up](https://github.com/Bumblebiber/team-up) package.

```bash
npm i -g team-up && team-up init
```

Standalone [team-up](https://github.com/Bumblebiber/team-up) is the live
package. This repository still ships the in-tree `o9k-roster` plugin so that
branch work is not lost. Once a team-up roster exists, o9k's `dispatch` skill
makes the mailbox protocol **mandatory** for external CLI workers.

- **Registry** (`~/.o9k/roster.json`): your models, CLIs, tiers, prices, and
  role chains as **CLI×model** cells (e.g. `cursor:grok-4.5-high`,
  `hermes:deepseek-v4-pro`). Chain cells may carry a CLI-native `effort`
  string (precedence: chain-entry > role > model; see skill `roster` § Effort).
  Yours to curate — o9k ships only the schema and example data.
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

## What team-up covers

Roster registry, deterministic `pick`/`dispatch`, limit watch, the subscription
usage collector, score refresh, session-limit handoff, the plan→implement→review
pipeline, and cross-CLI mailbox runs with reboot resume. Its own README and
`roster` skill are the reference — this page deliberately does not mirror them,
because a copy would drift.

## The one o9k rule: Path B is not optional

`dispatch` has two paths:

- **Path A** — in-host subagents (searches, digests, lookups). Always available,
  no roster needed. Single-agent users stay here and can ignore the rest.
- **Path B** — an **external** CLI process the parent will not drive turn by
  turn. Applies once team-up is installed and a roster exists.

A Path B spawn is complete only with all three:

1. a mailbox run id from `team-up runs create …`
2. the worker started via `team-up dispatch --run-id <id> …`
3. a cheap in-host watcher blocking on `team-up runs wait <id>`

Bare `team-up dispatch` without mailbox and watcher is an **incomplete spawn**:
the parent goes silent while tmux sits idle or stuck, and nobody notices. Never
report "it's running" to the human before the watcher exists.

Detection, before any external spawn:

```bash
command -v team-up && test -f ~/.team-up/roster.json
```

No roster → Path A only. Never invent Path B for a machine that has no roster.

## Model choice

Dispatch decides *whether* to delegate; team-up decides *who* does it. Map the
task to a role and let `team-up dispatch` resolve the model — never pick one by
vibe, and never hard-code a model name in a prompt or skill.

Full contract: the `dispatch` skill (§ Incomplete-spawn gate) and team-up's
`roster` skill (§ Cross-CLI runs).
