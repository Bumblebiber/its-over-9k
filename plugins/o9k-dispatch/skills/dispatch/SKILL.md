---
name: dispatch
description: "Cost-gated subagent dispatch for context isolation. Use for broad searches, lookups, log analysis, doc digestion, or tasks that decompose into independent subtasks — anything whose working noise shouldn't live in the main context. Includes the fan-out cost gate and the RESULT-only subagent contract."
---

# dispatch — Subagent Isolation

A subagent's context dies with it; only its conclusion survives. Use that:
run the noisy work where the noise is free.

## When to dispatch (any one suffices)

- **Search/lookup with unknown scope** — "where is X handled?", "does Y exist?",
  fan-out greps across many files.
- **High-noise, low-conclusion work** — digest a log file, read documentation,
  analyze a dataset; the answer is 3 lines, the working set is 30k tokens.
- **Independent subtasks** — the task splits into parts that don't need each
  other's intermediate state.
- **Memory recall** — searching the memory store (see `memory` skill) without
  loading candidate entries into the main context.

## The cost gate — dispatch is not free

Each subagent starts cold and re-derives context. Before fanning out N agents:

1. **1 agent beats 3** when subtasks share context — parallel agents re-derive
   it N times and can't see each other's findings.
2. **Fan out only for ≥3 genuinely independent subtasks** or a single task whose
   working noise exceeds ~5× its conclusion.
3. **Never dispatch what one targeted grep answers.** The gate cuts both ways:
   trivially locatable things are cheaper inline (see `scout`).
4. **Never poll.** Background agents notify on completion; keep working or yield.

## The subagent contract

Every dispatched prompt must be **self-contained** (the subagent sees nothing of
this conversation) and must specify:

- The task, with every needed path/ID/constraint inlined
- The output format, and that ONLY the result comes back:

```
Return ONLY the result in this exact format — no preamble, no methodology,
no sign-off:
[RESULT]
<answer / findings / n/a>
[/RESULT]
```

- What to do on failure: return `[RESULT] NOT FOUND: <what was tried> [/RESULT]`
  — never a transcript of attempts.

## Receiving results

Integrate the conclusion; discard the rest. If a result contradicts the main
context, say so explicitly and resolve it — don't silently keep both versions.
