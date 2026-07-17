# o9k-scout Sandbox Extract — High-Volume Tool Output

**Date:** 2026-07-17  
**Status:** Approved (grill locked 2026-07-17)  
**Depends on:** `o9k-scout` skill, `docs/COMBINING.md` (context-mode mechanism note)  
**Project:** P0072 (o9k)  
**TIM idea:** `scout: sandbox-execute high-volume tool output instead of read-then-summarize`

## Problem

Scout's ladder ends in **read narrow** or **dispatch** for broad sweeps. Both
assume the agent can afford at least one full pass over tool output.

High-volume **shell/MCP tool** results break that assumption:

| Source | Typical size | Today | Cost |
|--------|-------------|-------|------|
| Test runner (vitest/jest) | 20–200 KB | Shell output → transcript | Full output × every subsequent turn |
| Linter (eslint/tsc) | 5–50 KB | Same | Same |
| Browser/Playwright snapshot | 50–500 KB | MCP or read | Same |
| CI log slice | 100 KB+ | `tail` still often too much | Same |

Scout already says "docs/logs over ~200 lines: extract the slice." That still
requires the agent to **receive** the blob once (or read a file), then grep —
one expensive hop.

**context-mode** (rival, 🔴 not adopted) shows a sharper cut: run analysis in an
isolated subprocess, return **only** the verdict (56 KB → 299 B). o9k should
steal the **mechanism**, not the framework (no memory/dispatch/hook monolith).

## Goals (v1)

1. Add a **scout-owned extract path** for a small set of high-volume categories.
2. Ensure **raw output never enters the agent transcript** on the happy path.
3. Ship **measurable receipts** (before/after bytes) for at least one pilot.
4. Preserve arbitration: **scout owns overview + extract**; dispatch owns broad
   code sweeps; memory/dispatch hooks untouched.

## Non-goals (v1)

- Installing or wrapping context-mode MCP.
- PostToolUse hooks on all hosts (unless grill locks otherwise — see options).
- Universal log parser for arbitrary formats.
- Replacing `dispatch` for codebase search.
- Auto-rewriting every Shell invocation (magic interception).
- npm dependencies beyond Node stdlib in extract scripts.

---

## Options considered (design tree)

### A. Integration surface — *who triggers extract?*

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **A1 Skill + shell one-liner** | Scout skill mandates: `cmd >$tmp 2>&1; node scout-extract.mjs --profile X $tmp` — agent sees **only** extract stdout | Zero hook collision; ships in `o9k-scout` only | Agent compliance; wrong command shape still leaks |
| **A2 PostToolUse hook** | `o9k-scout` or `o9k-core` hook replaces Shell output before transcript | Automatic | Hook ownership; per-host wiring; rivals context-mode |
| **A3 dispatch-only** | Subagent runs cmd+extract, returns RESULT | Fits isolation doctrine | Useless for inline debugging parent session |
| **A4 MCP tool `scout_digest`** | Agent calls MCP with raw blob | Explicit | New MCP surface; blob already in context to call it |

**Recommendation:** **A1 for v1**, document A2 as phase 2 if receipts prove skill
compliance is too weak.

### B. Execution sandbox — *how isolated?*

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **B1 `readFileSync` + byte cap** | Node reads file in-process, truncates at cap | Simple, testable, no subprocess to time out | Same UID as agent — trust extract script |
| **B2 `child_process` + timeout** | Kill runaway external cmd | Needed for exec-wrapped profiles | Overkill for v1 file-read path |

**Recommendation (v1):** **B1** — sync file read with `max_input_bytes` cap.
`timeout_ms` applies only to **future** profiles that shell out to a subprocess
(phase 2 / exec-wrapped); v1 vitest path has nothing to kill.

### C. Pilot categories — *what first?*

| Profile | Input | Extract output | Parse difficulty | Daily ROI |
|---------|-------|----------------|------------------|-----------|
| **C1 vitest** | `--reporter=json` file or stdout | failing tests + stack top | Low (JSON) | High |
| **C2 eslint** | `-f json` | errors by file, rule, line | Low | High |
| **C3 tsc** | `tsc --pretty false` | error lines grouped | Medium (regex) | Medium |
| **C4 playwright snapshot** | DOM/text dump | interactive elements, URL, title | High / volatile | High when debugging E2E |
| **C5 generic log** | arbitrary | grep patterns / last N errors | Low value, high false positive | Low — defer |

**Recommendation:** **C1 vitest JSON** pilot; **C2 eslint JSON** as second.
Defer C4 until hook or MCP path exists.

### D. Failure behavior

| Option | On parse fail / unknown profile | On input > `max_input_bytes` |
|--------|--------------------------------|------------------------------|
| **D1 Fail open** | 2 KB head/tail + `WARN:` + log path | **Truncate** at cap, parse truncated body, `WARN: truncated in=… cap=…` on stderr |
| **D2 Fail closed** | Exit non-zero | Reject / exit non-zero |

**Recommendation:** **D1** for both — never reject solely for size; truncate +
WARN fits fail-open. Receipt `in=` reports **file size on disk** (pre-truncate);
parser sees only first `max_input_bytes`.

### E. Artifact layout

```
plugins/o9k-scout/
  scripts/
    scout-extract.mjs          # CLI router
    extractors/
      vitest-json.mjs          # pure parse(summary)
      eslint-json.mjs
    fixtures/extract/          # golden inputs
  skills/scout/SKILL.md        # + "High-volume shell" section
```

CLI:

```bash
node scout-extract.mjs --profile vitest [--max-bytes N] < path/to/output.json
# stdout: compact summary + stderr: SCOUT_EXTRACT receipt line
```

Receipt (stderr, parseable):

```
SCOUT_EXTRACT profile=vitest in=48231 out=412 ratio=0.009
```

### F. Relationship to dispatch

| Task type | Owner |
|-----------|-------|
| "Where is X in the codebase?" | `dispatch` path A |
| "Why did tests fail?" with known test cmd | scout extract one-liner |
| "Search 40 files for pattern" | `dispatch` |
| Read 50-line source file | scout read-narrow |

**Rule:** extract is for **command output**, not file exploration.

---

## Proposed v1 solution (pending grill)

1. **A1 + B1 + C1 + D1 + E** as above.
2. Scout skill new section **"High-volume shell output"**:
   - Never run bare `npm test`, `eslint .`, `playwright test` when diagnosing.
   - Pattern: redirect to temp file → `scout-extract` → act on stdout only.
   - Full log path mentioned only if extract warns.
3. **No hooks** in v1.
4. Success = vitest fixture 40 KB → <2 KB summary with correct failure count.
5. Optional phase 2: PostToolUse on Claude Code only, profile detect from cmdline.

---

## Decisions (locked)

| # | Topic | Decision |
|---|-------|----------|
| D1 | Integration surface (G1) | **A1 Skill + shell one-liner** — no PostToolUse hook in v1; phase 2 only if compliance receipts fail |
| D2 | Pilot profile (G2) | **C1 vitest JSON** (`--reporter=json`); eslint JSON deferred to v1.1 unless trivial with router |
| D3 | Input limits (G3) | `max_input_bytes=1_048_576` (default); **truncate + WARN** when exceeded — never reject for size alone. No `timeout_ms` in v1 (sync read). |
| D4 | Parse fail (G4) | 2 KB head/tail + `WARN:` + log path hint |
| D5 | Receipt (G5) | stderr `SCOUT_EXTRACT profile=… in=… out=…` (`in` = file size on disk) |
| D6 | Scope (G6–G8) | vitest only v1; eslint v1.1; no Playwright; no `/o9k-stats` |
| D7 | Kill switch (G9) | `O9K_SCOUT_EXTRACT=off` → **literal pass-through**: read file (respecting byte cap) → stdout **unmodified**; stderr `WARN: SCOUT_EXTRACT disabled, pass-through` |
| D8 | Temp files (G10) | `$TMPDIR/o9k-scout-extract-$PPID-*` (skill documents; CLI does not create) |
| D9 | Timeout (deferred) | `timeout_ms=30_000` reserved for future exec-wrapped profiles only |

## Grill gate

| # | Question | Class | Recommended default |
|---|----------|-------|-------------------|
| G1 | Is **skill-enforced one-liner** (A1) acceptable for v1, or is **automatic hook** (A2) mandatory? | **LOCKED → A1** | Skill + one-liner; hooks phase 2 |
| G2 | First pilot profile? | **LOCKED → C1** | vitest JSON |
| G3 | Max input bytes + overflow? | **LOCKED** | 1 MiB; truncate + WARN, never reject for size |
| G4 | On parse fail, expose 2 KB head/tail (D1)? | GUESS-SAFE | Yes |
| G5 | stderr receipt line format? | GUESS-SAFE | `SCOUT_EXTRACT profile=… in=… out=…` |
| G6 | Second profile in v1 or v1.1? | GUESS-SAFE | eslint JSON in same PR if cheap, else v1.1 |
| G7 | Playwright/snapshots in v1? | GUESS-SAFE | **No** — defer |
| G8 | Wire into `/o9k-stats`? | GUESS-SAFE | No — manual receipt in tests only |
| G9 | `O9K_SCOUT_EXTRACT=off` kill switch? | **LOCKED** | Literal pass-through to stdout + WARN stderr |
| G10 | Temp file location? | GUESS-SAFE | `$TMPDIR/o9k-scout-extract-$PPID-*` |

---

## Acceptance criteria (draft)

1. `scout-extract.mjs --profile vitest` on a golden fixture prints a summary
   with failed test names and ≤2 KB stdout for a ≥30 KB input.
2. Receipt line reports `in`/`out` byte counts with `out/in < 0.1` on fixture.
3. Scout skill documents the one-liner pattern; `using-o9k` arbitration table
   unchanged (scout still owns overview).
4. `node --test` under `plugins/o9k-scout/scripts/` passes offline.
5. COMBINING.md cross-link only — no new companion.

## Verification (draft)

| Test | Proves |
|------|--------|
| `extractors/vitest-json.test.mjs` | AC 1–2 |
| `scout-extract-cli.test.mjs` | byte-cap truncate+WARN, kill-switch pass-through, unknown profile |
| Skill lint / manual review | AC 3 |

## Open after grill

- [x] G1–G10 locked
- [x] Pre-build gaps locked (truncate+WARN, no v1 timeout, pass-through kill switch, Task 4 required)
- [x] Spec Approved
- [x] Implementation: `docs/superpowers/plans/2026-07-17-o9k-scout-sandbox-extract.md`
