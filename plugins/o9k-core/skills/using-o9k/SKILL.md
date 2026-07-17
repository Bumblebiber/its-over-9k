---
name: using-o9k
description: "Meta-skill for the o9k efficiency framework. Establishes the token-efficiency doctrine and arbitrates between o9k pillars and third-party frameworks (who owns which hook, style, plan, and map). Load at session start and whenever unsure which efficiency skill applies."
---

# using-o9k — The Doctrine

You are running under the o9k efficiency framework. Its goal: maximize the
fraction of your context window doing useful work. Every token you emit or load
gets re-read on every subsequent turn — waste compounds.

## The five pillars and when each applies

| Situation | Pillar | Skill |
|-----------|--------|-------|
| Writing any response | Output compression | `caveman` |
| About to open/read/explore code | Context discipline | `scout` |
| A search, lookup, or decomposable task | Subagent isolation | `dispatch` (path A) |
| External CLI worker in tmux (opt-in) | Multi-agent roster | `roster` + `dispatch` path B — only if `~/.o9k/roster.json` exists |
| Session start, project questions, "what was the state?" | Memory | `memory` |
| Conflict between any of the above | Arbitration | this skill |

Most installs never use the roster row. Missing `roster.json` → ignore it;
ordinary dispatch stays in-host RESULT subagents.

## Core rules (always on)

1. **Never load what you can look up later.** Prefer an ID, a path, a one-line
   summary over the full content. Drill down only when the task demands it.
2. **Never repeat what's already in context.** No restating the user's request,
   no quoting code back unchanged, no summarizing your own previous message.
3. **Output is future input.** Everything you say now is context tax on every
   later turn. Say it once, say it short (see `caveman`).
4. **Isolate the noisy work.** Broad searches, log dumps, doc reading — send a
   subagent (see `dispatch`); keep only the conclusion.
5. **Persist before you lose it.** Approaching compaction or `/clear`: flush
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
| Output style / tone | `o9k-caveman` | Claude Code output-styles, persona skills |
| Session-start context injection | the memory MCP's hook (TIM or hmem) | any other SessionStart injector |
| The repo overview map | `o9k-scout` (one map per session) | codesight + Serena + repo-map all generating overviews |
| Symbol-level navigation/edits | Serena MCP if installed, else plain tools | — |
| "The plan" | beads if installed, else the plan file | plan content duplicated into CLAUDE.md or memory |
| Task/issue state | beads if installed, else memory T-entries | parallel TODO markdown files |
| Workflow methodology (TDD, review, brainstorm) | superpowers if installed | — |
| Subagent dispatch | `o9k-dispatch` | superpowers' `dispatching-parallel-agents` (disabled 2026-07-17 — owner is o9k) |
| Cross-CLI who/spawn (optional) | `o9k-roster` if installed + configured | hard-coded model picks in prose; never a second dispatch owner |

## Exceptions that override everything

Efficiency never outranks correctness or safety. Use full, explicit prose for:
security warnings, destructive/irreversible actions, legal/compliance content,
ambiguous multi-step instructions the user must follow exactly, and anything
that will be pasted somewhere else (commit messages, PR bodies, docs).
