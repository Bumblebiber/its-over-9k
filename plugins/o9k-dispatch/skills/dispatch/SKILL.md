---
name: dispatch
description: "Cost-gated subagent dispatch for context isolation. Use for broad searches, lookups, log analysis, doc digestion, independent subtasks, OR whenever you spawn an external CLI worker via the team-up companion (planner/implementer/reviewer in tmux, cursor-agent/claude/codex/hermes). Path A = in-host RESULT subagents. Path B = mailbox run + team-up dispatch --run-id + cheap in-host watcher (runs wait) — REQUIRED for every external CLI tmux spawn when a team-up roster exists; bare dispatch without a watcher is an incomplete spawn (parent never gets notified)."
---

> **Note:** The cross-CLI mailbox runtime is the standalone `team-up` package —
> o9k ships no roster code, it only arbitrates the concern. Path-B contract
> unchanged: create → dispatch `--run-id` → `runs wait`.

# dispatch — Subagent Isolation

A subagent's context dies with it; only its conclusion survives. Use that:
run the noisy work where the noise is free.

## Two paths — pick by setup, not by habit

| Path | When | What you do |
|---|---|---|
| **A — In-host (default)** | Greps, digests, memory lookup, Haiku-class helpers — work that stays inside this host's subagent tool | Host Task/subagent tool; RESULT-only contract below |
| **B — Cross-CLI mailbox** | a `team-up` roster exists **and** you are putting work in an **external** CLI process (tmux via `team-up dispatch`, or equivalent Cursor/Claude/Codex/Hermes worker the parent will not drive turn-by-turn) | Mailbox + `--run-id` + **cheap in-host watcher** — see checklist below |

team-up is **opt-in for the machine**. Once it is installed, Path B is **not** optional for external CLI workers. Skipping the watcher is how parents go silent while tmux sits idle or stuck.

Detection (cheap):

```bash
# Path B applies when BOTH succeed AND the work is an external CLI worker:
command -v team-up && test -f ~/.team-up/roster.json
```

Without team-up → Path A only (or legacy Hermes notify_on_complete). No roster = no-op for single-agent users — never invent Path B.

## Incomplete-spawn gate (read before you tell the human "it's running")

A Path B spawn is **complete** only when all three exist:

1. Mailbox run id from `$RUNS create …`
2. Worker started with `$ROSTER dispatch … --run-id <id>` (or linked equivalent)
3. A **cheap in-host watcher subagent** whose sole job is `$RUNS wait <id>` (one blocking OS wait — not a model polling loop)

If you only have a tmux session name / attach string and no watcher → **you did not finish the spawn**. **STOP.** Do not report "running", "spawned", or paste an attach command to the human until step 3 exists. Add mailbox + watcher first, or kill the orphan and redo.

Why: tmux has no callback into this chat. Without `runs wait`, the parent never learns `done|question|failed`. That is the failure mode this section exists to prevent.

Quick self-check before any status message: can you answer "what is `$RUNS wait` returning right now?" If no → incomplete spawn.

## Anti-pattern (real failure)

```text
# WRONG — looks busy, notifies nobody
$ROSTER dispatch --role planner --prompt-file PLANNER_PROMPT.md --dir ~/tasks/foo
# → prints tmux session; parent moves on; human waits; worker may even be
#   stuck on an interactive prompt with zero artifacts written
```

```text
# RIGHT — parent gets a status back
$RUNS create … --prompt-file PLANNER_PROMPT.md   # → runId
$ROSTER dispatch --role planner --prompt-file PLANNER_PROMPT.md --dir ~/tasks/foo --run-id <runId>
# spawn cheap in-host watcher: only `$RUNS wait <runId>`, return status, exit
```

**Do not** invent Path B for greps, doc digests, or Haiku-class in-host helpers.
**Do not** LLM-poll tmux from the frontier parent when Path B applies — that is
what the watcher is for.

## When to dispatch (any one suffices)

- **Search/lookup with unknown scope** — Path A.
- **High-noise, low-conclusion work** — Path A.
- **Independent subtasks** — Path A fan-out (cost gate below).
- **Memory recall** — Path A (see `memory` skill).
- **External planner / implementer / reviewer / long coding CLI** — Path B when roster is configured; never bare `dispatch` without mailbox+watcher.

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

## Path B — External CLI checklist

Full protocol detail lives in team-up's own `roster` skill § Cross-CLI runs.

### Copy-paste recipe (Overseer / parent)

```bash
ROSTER="team-up"
RUNS="team-up runs"
TASK_DIR="~/projects/tasks/task-foo"
PROMPT="$TASK_DIR/PLANNER_PROMPT.md"   # bare task text is fine — create wraps it

# 1) Mailbox (wraps PROMPT with templates/worker-prompt.md → HEARTBEAT + STATUS=done)
CREATE=$($RUNS create --cwd "$TASK_DIR" --role planner \
  --parent-cli cursor --parent-attach manual \
  --worker-cli claude --prompt-file "$PROMPT" --project P0062)
RUN_ID=$(echo "$CREATE" | awk '/^runId:/{print $2}')

# 2) Worker — with --run-id, dispatch injects mailbox/PROMPT.md (wrapped), NOT the bare file
$ROSTER pick --role planner          # expect chain exhausted? stop or curate fallbacks
$ROSTER dispatch --role planner --prompt-file "$PROMPT" --dir "$TASK_DIR" --run-id "$RUN_ID"

# 3) Cheap in-host watcher (Path A) — sole job:
#    $RUNS wait "$RUN_ID" --ceiling-sec 7200
#    return status; see templates/watcher-prompt.md
```

Minimum mental model:

1. `$RUNS create …` (auto-wraps mailbox protocol into `mailbox/PROMPT.md`).
2. `$ROSTER dispatch … --run-id <id>` (tmux worker gets the **wrapped** prompt).
3. Spawn a **cheap** in-host watcher: only `$RUNS wait <runId>`, return
   `{question|done|failed|watching}`, exit.
4. On `question`: answer or escalate to human → `$RUNS answer` → **respawn** watcher.
5. On `done`/`failed`: read `mailbox/RESULT.md` (and task-dir artifacts); memory/TIM closeout only if useful.

### Disk artifacts ≠ done

`PLAN.md` / `GRILL.md` in the task dir can exist while mailbox `STATUS` is still
`watching`. That is a **protocol miss** (worker forgot closeout). The watcher
will not return `done` until `mailbox/STATUS=done` **and** `mailbox/RESULT.md`
exist. Do not treat cwd files alone as completion — wait for the watcher, or
recover with `$RUNS set-status <id> done` only after writing `mailbox/RESULT.md`
yourself (parent recovery, rare).

`wait-mailbox.sh` ignores HEARTBEAT / non-terminal STATUS changes — it only
wakes on `done|failed|cancelled|waiting_human`. A watcher that returns
`watching` after a few seconds is a bug (or ceiling), not success.

Watcher is disposable; mailbox on disk is continuity. Parent does not hot-loop
poll. After host crash: `$RUNS resume` (agentless) — not your problem mid-turn
unless the user asks.

## Receiving results

Integrate the conclusion; discard the rest. If a result contradicts the main
context, say so explicitly and resolve it — don't silently keep both versions.

## Model choice (when team-up is installed)

Dispatch decides WHETHER to delegate; team-up decides WHO does it. Before
spawning a Path B worker, map the task to a roster role and use
`team-up dispatch` (with `--run-id`) — never invent a model by vibe. See
team-up's `roster` skill.

Without team-up, skip this section entirely (Path A uses the host's normal
subagent model defaults).

## Skill metadata (maintainers)

The YAML `description` is the trigger line — hosts match it before loading this
file. Keep it **pushy**: Path B + mailbox + watcher + "incomplete spawn" must stay
in the one-liner. Softening it ("optional mailbox", "consider watcher") recreates
the silent-parent failure mode; do not trim that language when editing.
