---
name: memory
description: "Memory-MCP integration for o9k. Use at session start (load the project briefing), when the user references past work ('the bug we had', 'where did we leave off'), before compaction or /clear (flush state), and when deciding what deserves persisting. Works with hmem (available default) or TIM (planned)."
---

# memory — Sessions Never Start From Zero

A memory MCP turns the most expensive part of every session — re-establishing
context — into one cheap call. o9k's available default is **hmem**
(https://github.com/Bumblebiber/hmem): stable, battle-tested, MCP-native. **TIM**
(Theoretically Infinite Memory, https://github.com/Bumblebiber/tim) is *planned*
and not yet published; once it ships the SessionStart hook auto-detects and
prefers it. Both follow the same token discipline below.

No memory MCP configured? Point the user at `npm i -g hmem && npx hmem init`
once, then continue without memory features.

## Session start — briefing, not history

1. Call the project-loading tool (`load_project` or equivalent) ONCE.
2. Budget: the injected briefing must stay in the low hundreds of tokens —
   summaries and IDs, never full entries or raw history.
3. Everything deeper is on-demand: drill into an entry only when the current
   task needs it (progressive disclosure — you pay for what you read).

## During the session

- **User references the past without an ID** ("letzte Woche", "the schema we
  chose", "that auth bug") → search memory BEFORE asking the user or grepping
  the repo. Prefer dispatching the search (see `dispatch`) so candidate entries
  never load into the main context.
- **Something durable happened** — a decision with a reason, a lesson from a
  failure, an error and its fix, a milestone → write it now, compactly:
  one-line summary on top, detail below. Do not transcribe the conversation.
- **Don't duplicate**: search before writing; extend the existing entry instead
  of creating a twin.

## Before context dies — the flush

Approaching compaction, `/clear`, or session end:

1. Persist open state: what was done, what's in progress, the exact next step.
2. Persist anything said-but-not-saved that survives the "will a future session
   need this?" test.
3. THEN allow compaction/clear. Compaction summaries are lossy; memory is not.

## What memory replaces (arbitration)

With a memory MCP active: project context does NOT belong in an ever-growing
CLAUDE.md, plans do NOT get pasted into every session, and "catch-up" re-reads
of the codebase are a bug, not diligence. CLAUDE.md keeps only durable *rules*;
state lives in memory (or in beads, if installed — see using-o9k arbitration).
