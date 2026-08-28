---
name: using-o9k
description: "Meta-skill for the o9k doctrine and arbitration — who owns output style, the repo map, dispatch, memory, the plan. Load at session start, on conflicts between efficiency skills, and whenever unsure Path A vs Path B — if a team-up roster exists, external CLI tmux workers require team-up + dispatch mailbox/watcher (not bare dispatch). Also use when caveman vs other output-styles collide."
---

# using-o9k — The Doctrine

You are running under the o9k efficiency framework. Its goal: maximize the
fraction of your context window doing useful work. Every token you emit or load
gets re-read on every subsequent turn — waste compounds.

o9k itself owns no efficiency feature. It is the connector: it decides which
installed framework owns which concern, wires them into every host, and keeps
them from colliding. Whether a given rule below applies depends on what the
user opted into — read the table, not your memory of a default install.

## What applies, and when

| Situation | Concern | Owner (if installed) |
|-----------|---------|----------------------|
| Writing any response | Output compression | `caveman` (upstream project) |
| About to open/read/explore code | Context discipline | `scout` (o9k-scout) |
| A search, lookup, or decomposable task | Subagent isolation | `dispatch` path A (team-up) |
| External CLI worker (tmux / cross-CLI) | Multi-agent roster | team-up's `dispatch` path B — **required** once a roster exists |
| Session start, project questions, "what was the state?" | Memory | `memory` (o9k-memory) |
| Conflict between any of the above | Arbitration | this skill |

A row whose owner is not installed simply does not apply. Do not emulate a
missing pillar by hand, and do not tell the user they are missing one unless
they ask.

**Roster detection gate** (run before any external CLI spawn):

```bash
command -v team-up && test -f ~/.team-up/roster.json
```

- **No roster** → Path A only (in-host RESULT subagents).
- **Roster present** → external CLI workers **must** use Path B:
  `runs create` → `team-up dispatch --run-id` → cheap in-host `runs wait` watcher.
  Bare tmux dispatch without mailbox + watcher = **incomplete spawn** — parent
  never gets notified. See `dispatch` § Incomplete-spawn gate.

## Core rules (always on)

1. **Never load what you can look up later.** Prefer an ID, a path, a one-line
   summary over the full content. Drill down only when the task demands it.
2. **Never repeat what's already in context.** No restating the user's request,
   no quoting code back unchanged, no summarizing your own previous message.
3. **Output is future input.** Everything you say now is context tax on every
   later turn. Say it once, say it short (see `caveman`).
4. **Isolate the noisy work.** Broad searches, log dumps, doc reading — send a
   subagent (see `dispatch` path A); keep only the conclusion.
5. **External workers need a callback.** When a team-up roster exists and
   you spawn an external CLI in tmux, Path B is mandatory — not a shortcut,
   not "when you remember." Three steps or the spawn is incomplete: `runs
   create`, `dispatch --run-id`, watcher on `runs wait`. Never report "running"
   to the human until the watcher exists.
6. **Persist before you lose it.** Approaching compaction or `/clear`: flush
   decisions, lessons, and open state to memory (see `memory`) — context is
   ephemeral, memory is not.

## Arbitration: exactly one owner per concern

Multiple efficiency frameworks installed together WILL collide. These ownership
rules resolve every collision; when a third-party framework claims a concern
below, either it or the o9k pillar must be disabled — never run two owners:

When an arbitration needs a human decision (e.g. two dispatch owners), don't
lecture — surface it once and point to `/o9k-guide`, which walks the user
through it and offers to apply the fix.

| Concern | Owner | Displaced alternatives |
|---------|-------|------------------------|
| Output style / tone | upstream `caveman` | Claude Code output-styles, persona skills; caveman's own `cavecrew` (dispatch, owner is team-up) and `caveman-stats` (cost) skills — disable those two |
| Session-start context injection | the memory MCP's hook (TIM or hmem) | any other SessionStart injector |
| The repo overview map | `o9k-scout` (one map per session) | codesight + Serena + repo-map all generating overviews |
| Symbol-level navigation/edits | Serena MCP if installed, else plain tools | — |
| "The plan" | beads if installed, else the plan file | plan content duplicated into CLAUDE.md or memory |
| Task/issue state | beads if installed, else memory T-entries | parallel TODO markdown files |
| Workflow methodology (TDD, review, brainstorm) | superpowers if installed | — |
| Subagent dispatch (in-host) | `team-up`'s `dispatch` path A | superpowers' `dispatching-parallel-agents` (disabled 2026-07-17 — owner is team-up) |
| Cross-CLI who/spawn + mailbox | `team-up` (own repo), `dispatch` path B once a roster exists | hard-coded model picks; bare `team-up dispatch` without `runs create` + `--run-id` + watcher; a second dispatch owner |
| The host status bar | `o9k-statusline` (own repo) | a second statusLine command per host |
| Markdown attribution | `md-provenance` (own repo) | hand-written "written by" headers |

## Exceptions that override everything

Efficiency never outranks correctness or safety. Use full, explicit prose for:
security warnings, destructive/irreversible actions, legal/compliance content,
ambiguous multi-step instructions the user must follow exactly, and anything
that will be pasted somewhere else (commit messages, PR bodies, docs).
