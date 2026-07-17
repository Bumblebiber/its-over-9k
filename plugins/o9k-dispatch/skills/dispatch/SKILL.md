---
name: dispatch
description: "Cost-gated subagent dispatch for context isolation. Use for broad searches, lookups, log analysis, doc digestion, or tasks that decompose into independent subtasks — anything whose working noise shouldn't live in the main context. Includes the fan-out cost gate and the RESULT-only subagent contract. Optional branch: when o9k-roster is configured for cross-CLI workers, use mailbox runs + cheap watcher instead of LLM-polling tmux."
---

# dispatch — Subagent Isolation

A subagent's context dies with it; only its conclusion survives. Use that:
run the noisy work where the noise is free.

## Two paths — pick by setup, not by habit

Most users never leave the **default** path. Multi-agent / cross-CLI is opt-in.

| Path | When | What you do |
|---|---|---|
| **A — In-host (default)** | Always, unless path B applies | Host Task/subagent tool; RESULT-only contract below |
| **B — Cross-CLI mailbox** | `o9k-roster` installed **and** `~/.o9k/roster.json` exists **and** the work is an **external** CLI worker in tmux (Codex/Cursor/…), not an in-host search subagent | `runs.mjs` create → dispatch `--run-id` → cheap watcher runs `runs wait` → return/respawn on question — see `roster` skill § Cross-CLI runs |

**Do not** invent path B for greps, doc digests, or Haiku-class in-host helpers.
**Do not** LLM-poll tmux from the frontier parent when path B applies — that is
what the watcher + `wait-mailbox.sh` are for.

Detection (cheap):

```bash
# Path B only if both succeed and the task is external-CLI work:
test -f ~/.o9k/roster.json && test -f "<marketplace>/plugins/o9k-roster/scripts/runs.mjs"
```

Without roster / without `roster.json` → path A only. Missing files = no-op,
never an error for single-agent users.

## When to dispatch (any one suffices)

- **Search/lookup with unknown scope** — "where is X handled?", "does Y exist?",
  fan-out greps across many files.
- **High-noise, low-conclusion work** — digest a log file, read documentation,
  analyze a dataset; the answer is 3 lines, the working set is 30k tokens.
- **Independent subtasks** — the task splits into parts that don't need each
  other's intermediate state.
- **Memory recall** — searching the memory store (see `memory` skill) without
  loading candidate entries into the main context.
- **External implementer/reviewer CLI** (path B only) — long coding phase on
  another host CLI; parent stays free to talk to the human.

## The cost gate — dispatch is not free

Each subagent starts cold and re-derives context. Before fanning out N agents:

1. **1 agent beats 3** when subtasks share context — parallel agents re-derive
   it N times and can't see each other's findings.
2. **Fan out only for ≥3 genuinely independent subtasks** or a single task whose
   working noise exceeds ~5× its conclusion.
3. **Never dispatch what one targeted grep answers.** The gate cuts both ways:
   trivially locatable things are cheaper inline (see `scout`).
4. **Never poll in model turns.** Path A: background agents notify on completion.
   Path B: one blocking `runs wait` inside the watcher (OS wait), then return.

## Path A — The subagent contract (default)

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

## Path B — External CLI (only if roster configured)

Short form (full protocol in `roster` skill):

1. `$RUNS create … --prompt-file …` (worker-prompt template / HEARTBEAT).
2. `$ROSTER dispatch … --run-id <id>` (or equivalent tmux spawn linked to the run).
3. Spawn a **cheap** in-host watcher whose sole job is `$RUNS wait <runId>`, then
   return `{question|done|failed|watching}` and exit.
4. On `question`: answer or escalate to human → `$RUNS answer` → **respawn** watcher.
5. On `done`/`failed`: read mailbox RESULT; memory/TIM closeout only if useful.

Watcher is disposable; mailbox on disk is continuity. Parent does not hot-loop
poll. After host crash: `$RUNS resume` (agentless) — not your problem mid-turn
unless the user asks.

## Receiving results

Integrate the conclusion; discard the rest. If a result contradicts the main
context, say so explicitly and resolve it — don't silently keep both versions.

## Model choice (when o9k-roster is installed)

Dispatch decides WHETHER to delegate; roster decides WHO does it. Before
spawning a **non-trivial** worker (path B, or a heavy in-host role), map the
task to a roster role and consult `roster pick --role <role>` — or hand the
spawn to `roster dispatch`. See the `roster` skill.

Without o9k-roster / without `~/.o9k/roster.json`, skip this section entirely
(path A uses the host's normal subagent model defaults).
