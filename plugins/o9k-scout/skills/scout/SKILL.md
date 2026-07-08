---
name: scout
description: "Context-loading discipline for codebases. Use BEFORE opening, reading, or exploring files: search first, read narrow, build one repo map per session instead of wandering. Prevents the 20k-token 'let me look around' burn."
---

# scout — Context Discipline

The cheapest token is the one never loaded. Explore structure, not content.

## The ladder — always start at the top

1. **Memory first.** Project already known? Ask the memory MCP (`load_project`
   or search) before touching the filesystem — a 300-token briefing beats a
   20k-token re-exploration.
2. **Map second.** Need repo orientation? Build/read ONE overview: file tree
   (`ls`/glob), or a generated map (codesight `CONTEXT.md`, aider-style
   repo-map) if available. Cache it mentally — never regenerate mid-session.
3. **Search third.** Locate by symbol/pattern (grep, ast-grep, Serena
   `find_symbol`) — get `file:line`, not file contents.
4. **Read last, read narrow.** Open only the located range (offset/limit around
   the hit). Full-file reads only when the file is small or the task is a
   whole-file rewrite.

## Hard rules

- **Never read a file to find something** — that's what search is for.
- **Never re-read a file you just edited** — you know what's in it.
- **Never load generated artifacts** (lockfiles, dist/, minified, fixtures)
  unless they ARE the subject of the task.
- **Broad sweep needed?** (many files, unknown naming, "where is X handled?")
  → don't do it inline; hand it to `dispatch` and receive the conclusion only.
- **Docs/logs over ~200 lines:** extract the relevant slice (grep the error ID,
  read the section) — never the whole thing.

## Symbol work

If the Serena MCP (or an LSP-backed tool) is installed, symbol-level lookups and
edits go through it: `find_symbol` / `find_references` / targeted insert replace
an 8-step grep-and-read loop with one call. Scout owns the *overview*; Serena
owns the *symbols*. Never run both for the same question.

## Budget instinct

Before any read, estimate: "does the value of this content exceed its rent?"
Every loaded token is paid again on every subsequent turn until compaction.
A 5k-token file read that answers a yes/no question is a bad trade — search
for the one line that answers it.
