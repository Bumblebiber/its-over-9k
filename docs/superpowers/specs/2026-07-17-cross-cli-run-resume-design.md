# Cross-CLI Runs — Internal Watcher, Mailbox & Agentless Crash Resume

**Date:** 2026-07-17  
**Status:** Approved design (rev 2 — watcher return/respawn + blocking wait), pending implementation plan  
**Project:** P0072 (o9k); prior art in Hermes Overseer/orchestrator skills (P0062)

## Problem

When a frontier parent agent (Claude, Cursor, …) delegates implementation to an
external CLI worker in tmux (Codex, Composer, …), three gaps appear:

1. **Callback:** The worker cannot usefully “call back” into the live parent
   (e.g. `claude --resume <parentId>` opens a parallel interactive session; it
   does not inject a tool result into the running parent turn).
2. **Cost / availability:** If the frontier parent polls tmux itself, it burns
   expensive tokens and cannot talk to the human while waiting.
3. **Host crashes:** The Strato box reboots often enough that in-memory /
   tmux-only state is lost. Overnight parents intentionally stay in tmux; after
   reboot those sessions are gone and must be restored mechanically.

Hermes already solved parts of (1)–(2) with a thin-proxy worker that spawns
tmux and polls. That prior art is valuable but not durable across reboot and
is too coupled to pane-scraping instead of a file mailbox.

## Solution overview

**Approach A** — three layers:

1. **Mailbox + run registry on disk** (`~/.o9k/runs/<runId>/`) — source of
   truth for status, prompts, questions, answers, results. Continuity lives
   here; watcher processes are disposable.
2. **Internal watcher subagent** (cheap model, same host as parent) — starts
   the external worker tmux, **blocks in one shell wait** on mailbox changes
   (not an LLM turn per poll), then **returns** on `question` | `done` |
   `failed` | `parked`. Parent answers (or escalates), writes `ANSWER.md`,
   **respawns** the watcher. Respawn is cheap because disk holds state.
3. **Agentless `o9k-resume`** (systemd user unit + deterministic script, no
   LLM) — after boot, recreates missing tmux sessions, resumes CLI sessions
   by ID where possible, injects a short crash-recovery message.

TIM is **not** an operational audit bus. Disk holds process state. TIM receives
only semantically relevant closeout (outcomes, decisions, real errors) — same
spirit as Overseer closeout today.

## Non-goals (v1)

- LLM “resume agent” that decides what to restore (a classic systemd + script
  supervisor is in scope; an LLM is not).
- Using `claude --resume` (or equivalent) as a **live** worker→parent callback.
- Parent polling tmux itself under normal operation.
- Human-answer wall-clock timeouts (sleep / overnight waits are valid).
- Replacing Hermes Overseer wholesale — o9k generalizes the pattern; Hermes
  skills are prior art and may be patched later.

## Architecture

```
┌─ Parent (frontier; tmux optional; talks to human) ──────────────┐
│  creates run; spawns watcher; on return: answer Q / close /      │
│  respawn watcher                                                 │
│                                                                  │
│  Watcher (cheap, disposable)                                     │
│    ├─ ensure worker tmux                                         │
│    ├─ ONE blocking bash wait on mailbox/ (inotifywait | sleep) │
│    └─ return {question|done|failed|parked} — then exits          │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
  ~/.o9k/runs/<runId>/     ← control plane + mailbox (continuity)
  o9k-resume @ boot        ← recreate tmux + CLI resume + inject
```

Parent tmux is **optional** (`attach: tmux | manual`). Worker tmux is the
default execution home for external CLIs.

## Prior art (Hermes) — incorporate, do not freeze

Reference skills under `~/.hermes/skills/` (improvable):

| Skill | Maps to | Keep / sharpen |
|---|---|---|
| `devops/overseer` thin-proxy worker | Internal watcher | Spawn + poll + verify; no coding |
| `devops/orchestrator` | Watcher/worker ops | tmux lifecycle; `capture-pane`; ban 300s poll scripts |
| `autonomous-ai-agents/coding-delegation` | Parent prompt writing | English prompts, acceptance criteria, file prompts |
| `devops/worker-spawn-pitfalls` | Anti-patterns | RESULT/FAILED, spawn traps |
| `cli-tools` + per-CLI skills | Worker adapters | Resume argv per CLI |
| `orchestrator/references/agent-polling-comparison.md` | Pane heuristics | Ready indicators; **mailbox-first**, pane as fallback |
| `o9k/o9k-gateway-recovery` | Infra only | Separate from run resume |

### Planned improvements vs Hermes status quo

1. Mailbox files before pane scraping.
2. Durable `~/.o9k/runs/<id>/STATE.json` (reboot registry).
3. Agentless host-crash resume for all active runs.
4. Parent without tmux (`attach: manual`).
5. Question wait without human timeout; watcher returns on question and is
   respawned after `ANSWER.md` (mailbox is continuity).
6. Blocking OS wait inside one Bash call — never LLM-turn-per-poll.

## Run registry & mailbox

**Root:** `~/.o9k/runs/<runId>/`  
**runId:** e.g. `20260717T1255Z-<short>` (sortable, unique).

### `STATE.json` (control plane — boot reads only this)

```json
{
  "runId": "20260717T1255Z-a1b2",
  "version": 1,
  "createdAt": "…",
  "updatedAt": "…",
  "cwd": "/home/bbbee/projects/maimo-rpg",
  "project": "P0054",
  "role": "implementer",
  "status": "watching",
  "parent": {
    "cli": "claude",
    "sessionId": "kajshdf98uzadf9uj",
    "tmux": null,
    "attach": "manual"
  },
  "worker": {
    "cli": "codex",
    "model": "…",
    "sessionId": null,
    "tmux": "o9k-implementer-a1b2"
  },
  "watcher": {
    "kind": "internal_subagent",
    "attached": true
  },
  "mailbox": "mailbox/"
}
```

**`status`:** `starting` | `watching` | `waiting_human` | `done` | `failed` | `cancelled`

**`parent.attach`:** `tmux` | `manual`  
If `attach` is `manual`, `parent.tmux` is `null`. Boot does not spawn a parent;
it leaves a disk hint for the human/next session to `--resume`.

### Mailbox `mailbox/`

| File | Writer | Meaning |
|---|---|---|
| `STATUS` | Watcher | One-line: `watching` / `waiting_human` / `done` / `failed` |
| `RESULT.md` | Worker | Final outcome (roster-style contract) |
| `QUESTIONS.md` | Worker | Open clarification(s) |
| `ANSWER.md` | Parent | Answer after parent or human decision |
| `HEARTBEAT` | **Worker** (mandatory via `PROMPT.md` template) | ISO timestamp; watcher may refresh only as fallback if worker silent but tmux alive — prefer worker-owned |
| `PROMPT.md` | Parent at dispatch | Self-contained worker prompt (crash-safe); **must** instruct worker to touch `HEARTBEAT` periodically and write QUESTIONS/RESULT/STATUS protocol |
| `REATTACH_WATCHER` | Resume / parent | Optional flag: next parent should respawn watcher |

Workers never learn the parent session id — only the mailbox path.

### `STATE.json` writes

Watcher and `o9k-resume` both update `STATE.json`. `o9k-resume` uses
`~/.o9k/runs/.resume.lock`. The watcher does not take that lock for every
status flip — instead **all writers use atomic replace** (`write STATE.json.tmp`
→ `rename` over `STATE.json`). Readers tolerate a missing file for one retry.
No partial JSON on disk.

### Local logs (not TIM)

- `~/.o9k/logs/resume-<timestamp>.log` — boot resume actions  
- Optional append-only `mailbox/EVENTS.log` inside the run if needed for forensics  

## Watcher contract

**Who:** Internal subagent of the parent (cheap model). **Disposable.** Continuity
is the mailbox, not the watcher process. Parent may respawn the watcher after
every return (question answered, reattach after crash, etc.).

**Channel constraint:** A subagent has **one** return to the parent, then it is
done. Therefore the watcher **must return** on `question` (and on terminal
states). It cannot “notify mid-run and keep living.” Mid-run notify APIs are
out of scope / unreliable across hosts.

**May:** manage tmux lifecycle for this run’s worker; read/write mailbox;
run **one** long-blocking shell wait; return structured status to parent.

**Must not:** answer questions substantively; re-dispatch while worker tmux is
alive; poke parent via `--resume`; edit project code; run an LLM turn per poll
interval.

### Wait primitive (mandatory — cost)

Polling every 5–15s as separate model turns is forbidden (overnight would burn
thousands of turns). The watcher issues **exactly one** blocking Bash (or
equivalent) call that sleeps until mailbox activity or a hard ceiling, e.g.:

- Preferred: `inotifywait -e close_write,moved_to,create mailbox/` (or
  recursive on the run dir).
- Fallback: a single shell loop `while …; do sleep N; check mtimes; done` with
  a long `timeout(1)` / tool timeout (hours), still **one** tool call from the
  model’s perspective.

When the wait returns, the watcher inspects mailbox files **once**, updates
`STATE.json` atomically if needed, and **returns** to the parent. No second
wait in the same watcher lifetime unless the wait exited spuriously with no
signal (then one restart of the same blocking call is allowed before return).

### Lifecycle

1. Ensure worker tmux exists (else start from `PROMPT.md` / roster dispatch).
2. Clear or note prior `ANSWER.md` generation if resuming after a question
   (worker consumes answer; watcher should not re-fire the same question).
3. Start blocking wait on mailbox.
4. On wake, classify and **return**:

| Signal | Return status | Parent next step |
|---|---|---|
| new `QUESTIONS.md` / `waiting_human` | `question` + excerpt | Answer or escalate → write `ANSWER.md` → **respawn watcher** |
| `done` + valid `RESULT.md` | `done` | Close run; TIM closeout if useful |
| `failed` / dead tmux without RESULT | `failed` | Diagnose / deliberate re-dispatch |
| parent ending / park request | `parked` | Leave worker; later respawn watcher |
| wait ceiling hit, still `watching` | `watching` (soft) | Respawn watcher immediately (cheap) to continue wait |

**Structured return:**  
`{ status, runId, summary, question?, resultPath?, error? }` — no transcript dump.

**Timeouts**

- Human answer: **none** (parent may take hours/overnight; worker stays in
  tmux; no watcher is required while `waiting_human` until parent writes
  `ANSWER.md` and respawns).
- Worker liveness: if tmux gone and no recent `HEARTBEAT` → return `failed`.
  Overnight silence with live tmux + fresh-enough heartbeat is not failure.

## Parent orchestration

1. Create run (`STATE.json`, `PROMPT.md` with HEARTBEAT + mailbox protocol).
2. Spawn internal watcher with `runId`.
3. Stay free for the human / other work while watcher is blocked in Bash.
4. On watcher **return**:

| Return | Parent |
|---|---|
| `question` | Knows answer? → write `ANSWER.md`. Else escalate to human, then write `ANSWER.md`. Then **respawn watcher** (same `runId`). |
| `done` | Read `RESULT.md`; TIM closeout only if semantically useful |
| `failed` | Diagnose; re-dispatch deliberately |
| `parked` / soft `watching` | Respawn watcher when ready (immediately for soft `watching`) |
| after boot / `REATTACH_WATCHER` | Respawn watcher; do not re-dispatch if worker tmux alive |

Parent does not poll tmux or mailbox in a hot loop — it reacts to watcher
returns (and to the human). Mailbox writes are the only worker channel.

## Boot resume — `o9k-resume`

**What:** Deterministic script (Node preferred, same house style as
`roster.mjs`). **No LLM.**

**When:** `systemd --user` WantedBy=`default.target` (after tmux available).

**Algorithm**

1. Acquire `~/.o9k/runs/.resume.lock`.
2. Scan `~/.o9k/runs/*/STATE.json`.
3. Skip `done` | `failed` | `cancelled`.
4. For each active run, idempotently:

**Worker** — if `worker.tmux` set: if session exists → noop; else recreate
tmux in `cwd`, prefer CLI `--resume <sessionId>` when known, else cold start
from `PROMPT.md` (`recovery: cold_start`). Inject recovery message.

**Parent** — if `attach == tmux` and `parent.tmux` set: same pattern. If
`attach == manual`: do not spawn; set disk hint / `REATTACH_WATCHER`; human
or next IDE session resumes by id.

**Watcher** — never started as an LLM by `o9k-resume`. Leave mailbox so the
next live parent spawns a watcher reattach.

**Order:** restore workers first, then parents (so parent sees a live mailbox).

### Inject templates (English, short)

| Target | Message |
|---|---|
| Worker | `Host crash recovery. Read mailbox/STATUS and mailbox/PROMPT.md; continue the task. Do not re-init from scratch.` |
| Parent (tmux) | `Host crash recovery. Read ~/.o9k/runs/<id>/STATE.json. Continue orchestration; do not re-dispatch if worker tmux is alive.` |
| `waiting_human` | Append: `You were blocked on a human question — re-surface it; do not invent an answer.` |

### CLI resume adapters

Per-CLI table (derived from Hermes `cli-tools`, editable):

- Claude Code: `claude --resume <sessionId> "<inject>"` inside tmux.
- Cursor / Codex: respective resume if available; else cold start + PROMPT +
  “crash recovery, read RESULT/JOURNAL”.
- Unknown CLI: fail-soft cold start; record `recovery=cold_start` in STATE /
  local log.

`o9k-resume` does **not** own gateway/Telegram recovery (`o9k-gateway-recovery`).

## TIM usage (narrow)

| Do write to TIM | Do not write to TIM |
|---|---|
| Meaningful task done (outcome, commits) — closeout style | Every run_created / dispatch / poll |
| Decisions from Q&A that matter later | question/answer ping-pong |
| Real errors → E-entry (+ later learning) | Every host_crash_resume |
| Optional one-time link task ↔ runId | Heartbeats, lockfile, resume logs |

If TIM is down, recovery and mailbox still work. Disk is authority for runs.

## Failure modes

| Case | Behavior |
|---|---|
| Worker tmux dead, no RESULT | Watcher → `failed` (parent may re-dispatch) |
| Double resume, tmux alive | noop |
| Invalid sessionId | cold_start + PROMPT.md; local log |
| QUESTIONS pending across reboot | keep `waiting_human`; inject re-surface; parent writes ANSWER then respawns watcher |
| Watcher dead, worker alive | parent respawns watcher; worker untouched |
| Corrupt STATE.json | skip + log; no blind spawn |
| Parallel `o9k-resume` | lockfile |
| Concurrent STATE writers | atomic tmp+rename (see above) |

## Testing (v1)

1. Unit: status transitions; skip terminal runs; lockfile.
2. Integration with fake/stub tmux: argv building; idempotent `has-session`.
3. Mailbox contract without LLMs: QUESTION → watcher return → ANSWER →
   respawn → done.
4. Manual chaos: start run → kill tmux server → `o9k-resume` → worker (+
   parent if attach=tmux) back with inject visible.
5. Cost smoke: watcher issues a single long Bash wait (mock inotify); assert
   no per-interval model turns.

## Delivery placement (decide in plan phase)

- Spec: this file.
- Implementation: extend `plugins/o9k-roster` **or** add a small `o9k-runs`
  helper next to it — choose in the implementation plan.
- Hermes: follow-up patches (mailbox-first, run registry pointers), not a
  verbatim copy of skills into o9k.

## Open points for implementation plan

- Exact Claude / Cursor / Codex resume CLI flags (verify
  `claude --resume <id> "<inject>"` against current CLI).
- Package home: roster vs new pillar/scripts.
- systemd unit install via `/o9k-init` opt-in vs always-on for server installs.
- Default wait ceiling for soft `watching` return (e.g. 1h) vs rely only on
  inotify without ceiling.
- inotify availability on host; ship sleep-loop fallback in the same helper
  script the watcher invokes.
