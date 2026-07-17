# o9k-roster Usage Collector — Multi-Window Limits & Adaptive Watcher

**Date:** 2026-07-17  
**Status:** Approved (grill locked 2026-07-17) — **implemented** 2026-07-17  
**Depends on:** `docs/superpowers/specs/2026-07-16-o9k-roster-design.md`  
**Project:** P0072 (o9k)

## Problem

`o9k-roster` can skip exhausted models via `~/.o9k/usage.json`, but today:

1. **No collector writes that file.** `limit-watch.mjs` reads only; `usage --refresh`
   was specced in the roster design and never shipped. `check-usage.py` (Hermes cron)
   covers pay-per-use API balances only and explicitly skips subscription CLIs.
2. **Single scalar per provider is wrong.** Claude has independent windows (session,
   week, optional 5h rolling, Fable week). If session or 5h is at 95%, no Claude
   agent should spawn even when the week is at 50%. Fable week full must block
   `claude-fable-5` but not `claude-opus`.
3. **Cursor and Codex need interactive slash commands** for full usage tables.
   Cursor: `/usage` (Included / Auto / API). Codex: `/status` (Weekly limit bar).
4. **Fixed-interval polling wastes work.** When no agent CLI process runs, spawning
   collectors is pointless. Frequency should track live agent activity.

## Goals

1. Populate and maintain `~/.o9k/usage.json` with **per-window** usage fractions
   for subscription CLIs.
2. Update `pick()` / `dispatch()` to consult **model-specific window sets** —
   skip when any applicable window ≥ `handoff_at`.
3. Ship collectors via native CLI output (Claude fast path + PTY where required).
4. Ship an **adaptive process watcher** that triggers collection only when
   relevant CLIs are running (or just stopped), without feedback loops.
5. Preserve **`mark-limited`** as the error-driven path only (not auto-set by collector).

## Decisions (locked 2026-07-17)

| # | Topic | Decision |
|---|-------|----------|
| D1 | Cursor default window | `cursor:included` only; models may widen to `auto` / `api` via `limit_windows` |
| D2 | Claude collect path | **Fast path:** `claude -p "/usage"` (~5s). PTY fallback if parse incomplete. Documented exception to `CLAUDE.md` `-p` ban (read-only probe, `usage-collect.mjs` only) |
| D3 | PTY implementation | `expect` (system dep, no npm) |
| D4 | Stop hook | **Phase 2** — not blocking v1 |
| D5 | 100% parsed | Set `windows.*.used = 1.0` only — **no** auto `mark-limited` (single mechanism; `marked` stays error-path) |
| D6 | Watcher feedback loop | Collector children **excluded** from pgrep counts (env marker + cmdline filter) |
| D7 | Cross-process PTY | Global `flock` on `~/.o9k/.usage-pty.lock` |
| D8 | pgrep precision | Anchored patterns per CLI — not bare `pgrep -fc claude` |

## Non-goals (v1)

- Pay-per-use providers (DeepSeek, OpenRouter) — stay on `check-usage.py`.
- Scraping web dashboards.
- Usage-based model ranking (scores refresh remains separate).
- Advisor role / `--advisor` CLI templates (separate spec).
- Stop-hook integration (phase 2).
- MCP wrapper around collectors.

## Solution overview

```
plugins/o9k-roster/scripts/
  usage-collect.mjs           # merge parsers → usage.json; CLI entry
  usage-watcher.mjs           # pgrep loop → adaptive collect triggers
  usage-pty.mjs               # expect-based PTY runner (codex, cursor; claude fallback)
  usage-pty-lock.mjs          # flock helper (~/.o9k/.usage-pty.lock)
  usage-procs.mjs             # precise pgrep + collector-child exclusion
  collectors/
    parse-claude-usage.mjs    # pure: transcript → windows
    parse-codex-status.mjs    # pure: transcript → windows
    parse-cursor-usage.mjs    # pure: transcript → windows
  fixtures/usage/             # golden transcripts for tests
systemd/
  o9k-usage-watcher.service   # user unit (optional enable via o9k-init)
```

Trigger layers (all write the same `usage.json`):

| Layer | When | Cost |
|-------|------|------|
| **Watcher** | Process count delta or interval while agents run | pgrep cheap; collect only when due |
| **Pre-dispatch** | `roster dispatch` / `handoff` before spawn | One collect for target CLI |
| **Stop hook** (phase 2) | Claude `Stop`, debounced 15 min / CLI | One collect |
| **Daily cron** | Safety net if watcher dead | All subscription CLIs |
| **mark-limited** | Rate-limit error observed by an agent | No collect |

## Data model (`usage.json`)

Replace coarse `providers.<name>.used` as the **primary** signal. Keep
`providers` optionally during migration as deprecated mirror (max of windows).

```json
{
  "updated": "2026-07-17T14:00:00Z",
  "windows": {
    "claude:session": {
      "used": 0.07,
      "resets_at": "2026-07-17T18:10:00+02:00",
      "updated": "2026-07-17T14:00:00Z",
      "source": "claude:/usage"
    },
    "claude:week": { "used": 0.40, "resets_at": "...", "updated": "...", "source": "claude:/usage" },
    "claude:fable-week": { "used": 0.57, "resets_at": "...", "updated": "...", "source": "claude:/usage" },
    "claude:5h": { "used": 0.95, "resets_at": "...", "updated": "...", "source": "claude:/usage" },
    "codex:weekly": { "used": 1.00, "resets_at": "2026-07-23T17:26:00+02:00", "updated": "...", "source": "codex:/status" },
    "cursor:included": { "used": 0.54, "resets_at": null, "updated": "...", "source": "cursor:/usage" },
    "cursor:auto": { "used": 0.52, "resets_at": null, "updated": "..." },
    "cursor:api": { "used": 0.69, "resets_at": null, "updated": "..." }
  },
  "marked": {}
}
```

`marked` is written only by agents via `roster mark-limited` or explicit human
action — never by the collector on parsed 100%.

### Window key convention

| CLI | Primary cmd | Windows | Parser |
|-----|-------------|---------|--------|
| `claude` | `/usage` | `session`, `week`, `fable-week`, `5h` (+ extensible) | `Current <label>: N% used · resets <when>` |
| `codex` | `/status` | `weekly` | `N% left` → `used = 1 - N/100` |
| `cursor` | `/usage` | `included`, `auto`, `api` | table row `Included … N% used` |

### Watcher state (`~/.o9k/usage-watcher.json`)

```json
{
  "counts": { "claude": 0, "codex": 1, "cursor": 0 },
  "prev_counts": { "claude": 0, "codex": 0, "cursor": 0 },
  "state": "active",
  "collecting": { "claude": false, "codex": false, "cursor": false },
  "last_collect": { "claude": null, "codex": "2026-07-17T14:00:00Z", "cursor": null },
  "next_due": { "claude": null, "codex": "2026-07-17T14:15:00Z", "cursor": null }
}
```

`collecting.*` — watcher sets true before spawning collect; suppresses transition
detection while own collector runs (belt + suspenders with pgrep exclusion).

## Registry extension (`roster.json`)

```json
"subscriptions": ["claude", "codex", "cursor"],
"usage_watcher": {
  "tick_sec": 60,
  "intervals": { "idle_heartbeat_hours": 24, "active_min": 20, "busy_min": 8 }
}
```

Per-model `limit_windows` — see prior spec; defaults unchanged:
- Claude non-fable: all `claude:*` except `fable-week`
- Claude fable: includes `fable-week`
- Codex: `codex:weekly`
- Cursor: `cursor:included` only

## Selection logic (`pick()` changes)

```
for each window in resolveLimitWindows(model):
  if usage.windows[window]?.used >= handoff_at:
    skip "window {window} at {pct}%"
```

Legacy fallback: if `windows` empty, use `providers[model.provider].used` for one
release only.

## Collectors

### Claude (`usage-collect.mjs` → claude branch)

**Fast path (default):**
```bash
claude -p "/usage"
```
- Allowed by documented `CLAUDE.md` / `AGENTS.md` exception (read-only probe,
  `usage-collect.mjs` only).
- ~5s, no MCP cold-start, minimal session-quota impact vs interactive spawn.

**PTY fallback** when fast-path output missing required lines (e.g. format drift).

Set `O9K_USAGE_COLLECT=1` on any child process the collector spawns (PTY path
and fast path wrapper) for pgrep exclusion.

### Codex / Cursor — PTY only

| CLI | Spawn | Send | Exit |
|-----|-------|------|------|
| `codex` | `env O9K_USAGE_COLLECT=1 codex` | `/status` then `/exit` | wait for `Weekly limit` |
| `cursor` | `env O9K_USAGE_COLLECT=1 cursor-agent` | `/usage` then exit | wait for table |

`TERM=xterm-256color`. Handle `Continue anyway?` → `y`.

### Global PTY lock (`usage-pty-lock.mjs`)

All collect paths (watcher, pre-dispatch, cron, PTY fallback) acquire:

```javascript
await withPtyLock(() => collectCli(...));
// flock ~/.o9k/.usage-pty.lock, timeout 120s, exit 0 + skip on contention
```

Prevents watcher tick + `dispatch` pre-collect from spawning simultaneous TUIs.

### Failure modes

| Failure | Behavior |
|---------|----------|
| Timeout | Keep prior window data; log; non-zero exit |
| Rate-limit in transcript | `used: 1.0` + `resets_at` parsed — no `mark-limited` |
| Empty parse | Do not overwrite existing windows |
| Lock contention | Skip collect, log, proceed with stale cache |

## Process watcher — no feedback loop

### Precise process counting (`usage-procs.mjs`)

**Do not use** `pgrep -fc claude` — matches MCP servers, path arguments, etc.

| CLI | Count rule |
|-----|------------|
| `claude` | `pgrep -f` anchored: `/(^|/)claude( |$)` **and** cmdline lacks `O9K_USAGE_COLLECT=1` **and** not child of current collect PID tree |
| `codex` | `/(^|/)codex( |$)` same exclusions |
| `cursor` | `/(^|/)cursor-agent( |$)` same exclusions |

Pure function `countAgentProcesses({ excludePids, excludeEnv: 'O9K_USAGE_COLLECT' })`
for unit tests with mocked `/proc` or fixture cmdlines.

### Transition logic

| Event | Action |
|-------|--------|
| `idle → idle` | no-op (24h heartbeat optional) |
| `0 → N` (rise) | collect each CLI that rose — **unless** rise caused by own collector (excluded by pgrep) |
| `N → 0` (fall) | final collect for each CLI that fell — **unless** fall is collector exiting |
| interval while active/busy | collect due CLIs with `counts[cli] > 0` |

Set `collecting[cli] = true` in watcher state before `usage-collect --cli X`;
clear after exit. While `collecting[cli]`, ignore count changes for that CLI.

### Loop

1. `counts = countAgentProcesses()` (excludes collector children)
2. Compare to `prev_counts`; apply transition table
3. Update `prev_counts`; sleep `tick_sec`

## `usage-collect.mjs` CLI

| Command | Behavior |
|---------|----------|
| `usage-collect --cli <name>` | flock → collect one CLI |
| `usage-collect --all` | serialize over `subscriptions` |
| `roster usage --refresh [--cli X]` | alias in `roster.mjs` |

Before `spawnInTmux` in `dispatch` / `handoff`: `collectUsage({ clis: [resolvedCli] })`.
Failure is non-blocking (stale cache).

## Hook integration (phase 2)

Claude `Stop` → debounced collect. Spec deferred; do not block v1.

## Cron safety net

`usage-collect-cron.sh` — daily if watcher state older than 25h.

## Migration

1. `pick()` dual-read `windows` + legacy `providers` for one release.
2. Update `roster.example.json` with `subscriptions`, `limit_windows`.
3. Document `CLAUDE.md` `-p` exception (done).

## Testing

| Module | Method |
|--------|--------|
| Parsers | fixture transcripts |
| `usage-procs.mjs` | fixture cmdlines: MCP claude.js excluded, real `claude` counted, `O9K_USAGE_COLLECT=1` excluded |
| `usage-watcher.mjs` | pure `decideCollect()` — collector rise/fall does not retrigger |
| `usage-pty-lock.mjs` | concurrent acquire → one wins, one skips |
| `pick()` windows | fable vs opus; 5h blocks all claude |
| PTY live | `LIVE_PTY=1` optional smoke |

## Success criteria

1. Multi-window `usage.json` after `--all`.
2. Fable window hot → skip fable model, not opus.
3. `5h` hot → skip all Claude models.
4. Watcher idle 24h → zero collects.
5. **No feedback loop:** single `usage-collect --cli claude` does not cause second collect from 0→1→0 transition.
6. Concurrent watcher + dispatch → one PTY at a time (lock).
7. `pgrep` does not count `node …/mcp-server` or collector children.
8. Claude collect uses `-p` fast path by default; PTY only on parse miss.
9. All parser/lock/proc tests pass offline in `node --test`.

## References (empirical, 2026-07-17)

- `claude -p "/usage"` — session 7%, week 40%, Fable week 57%.
- Interactive `claude` spawn — MCP startup 10–30s; may affect session quotas.
- `codex /status` — `0% left (resets 17:26 on 23 Jul)`.
- `cursor-agent` interactive `/usage` — Included/Auto/API table (user sample).
