# o9k-scout Sandbox Extract — Implementation Plan

> **For agentic workers:** TDD per task; `node --test plugins/o9k-scout/scripts/*.test.mjs`

**Goal:** Ship vitest JSON extract CLI + scout skill one-liner so diagnostic test
runs never load raw runner output into the agent transcript.

**Architecture:** Pure extractor module + thin CLI router in `o9k-scout` scripts.
No hooks. Agent runs: redirect JSON to temp file → `scout-extract.mjs` → reads
stdout only.

**Tech Stack:** Node ≥18 ESM, `node --test`, zero npm deps.

**Spec:** `docs/superpowers/specs/2026-07-17-o9k-scout-sandbox-extract-design.md` (Approved 2026-07-17, gaps locked pre-build)

## Pre-build locks (2026-07-17)

| Gap | Decision |
|-----|----------|
| Input > max bytes | **Truncate + WARN** on stderr; parse truncated slice; receipt `in=` = full file size |
| Timeout | **Not in v1 CLI** — sync `readFileSync`; `timeout_ms` only when a profile shells out (future) |
| `O9K_SCOUT_EXTRACT=off` | Literal pass-through: file bytes → stdout unchanged; stderr WARN; exit 0 |
| Task 4 | **Required follow-up** immediately after merge (separate commit OK); not silently dropped |

## File map

| File | Responsibility |
|------|----------------|
| `plugins/o9k-scout/scripts/extractors/vitest-json.mjs` | Pure: JSON string → summary text |
| `plugins/o9k-scout/scripts/extractors/vitest-json.test.mjs` | Golden fixture tests |
| `plugins/o9k-scout/scripts/scout-extract.mjs` | CLI: profile router, limits, receipt |
| `plugins/o9k-scout/scripts/scout-extract.test.mjs` | CLI: cap truncate, kill-switch pass-through, unknown profile |
| `plugins/o9k-scout/scripts/fixtures/extract/vitest-fail.json` | ≥30 KB realistic failure JSON |
| `plugins/o9k-scout/skills/scout/SKILL.md` | "High-volume shell output" section |
| `docs/COMBINING.md` | Cross-link only if not already sufficient |
| `CHANGELOG.md` | `[Unreleased]` note under o9k-scout |

---

### Task 1: Pure vitest JSON extractor

**Files:** `extractors/vitest-json.mjs`, `fixtures/extract/vitest-fail.json`, `extractors/vitest-json.test.mjs`

- [ ] **Step 1:** Add golden fixture (multiple failing tests, long stacks) — target ≥30 KB on disk.
- [ ] **Step 2:** Write failing tests:
  - returns failed test count and names
  - stdout summary ≤ 2048 bytes for fixture
  - includes file:line for each failure
  - handles empty pass (all green) in ≤200 bytes
- [ ] **Step 3:** Implement `extractVitestJson(text) → { summary, stats }`.
- [ ] **Step 4:** `node --test extractors/vitest-json.test.mjs` — green.

---

### Task 2: CLI router `scout-extract.mjs`

**Files:** `scout-extract.mjs`, `scout-extract.test.mjs`

- [ ] **Step 1:** Failing tests:
  - `--profile vitest` on fixture → exit 0, receipt on stderr matching `SCOUT_EXTRACT profile=vitest in=\d+ out=\d+`
  - `out/in < 0.1` on fixture
  - unknown profile → exit 2 + message
  - input > max bytes → **truncate + WARN** on stderr (`truncated`); parse proceeds on prefix; receipt `in=` = full file size
  - `O9K_SCOUT_EXTRACT=off` → stdout **byte-identical** to input file; stderr `WARN: SCOUT_EXTRACT disabled`; exit 0
- [ ] **Step 2:** Implement CLI:
  ```
  node scout-extract.mjs --profile vitest [--max-bytes N] < path
  ```
  `readFileSync` with byte cap (slice for parser; full `stat.size` for receipt `in=`).
  If `O9K_SCOUT_EXTRACT=off`, write capped bytes to stdout and return (no extractor).
  No timeout in v1 — nothing subprocess-bound.
- [ ] **Step 3:** `node --test scout-extract.test.mjs` — green.

---

### Task 3: Scout skill + docs

**Files:** `skills/scout/SKILL.md`, `CHANGELOG.md`

- [ ] **Step 1:** Add skill section **High-volume shell output**:
  - Never bare `npm test` / `vitest run` when diagnosing failures
  - One-liner pattern with temp file + `--reporter=json`
  - Act on extract stdout only; full log path only when `WARN:`
  - Mention `O9K_SCOUT_EXTRACT=off` for raw debugging
- [ ] **Step 2:** CHANGELOG `[Unreleased]` Added bullet for sandbox extract.
- [ ] **Step 3:** Manual smoke:
  ```bash
  cd plugins/o9k-scout/scripts
  node scout-extract.mjs --profile vitest < fixtures/extract/vitest-fail.json | wc -c
  ```

---

### Task 4: TIM + version bump — **required follow-up** (separate commit OK)

**Do not drop.** Run immediately after Tasks 1–3 merge; may be same PR as a second
commit or a tiny follow-up PR same day.

- [ ] `tim_update` P0072 idea node: link spec + plan, status → in progress / done when shipped
- [ ] Bump `plugins/o9k-scout/.claude-plugin/plugin.json` patch version
- [ ] Log line in P0072/Log when extract ships

---

## Success checklist (from spec)

1. [ ] Golden vitest fixture ≥30 KB → summary ≤2 KB
2. [ ] Receipt `out/in < 0.1` on fixture
3. [ ] All `node --test plugins/o9k-scout/scripts/*.test.mjs` green
4. [ ] Skill documents one-liner; no hook changes
5. [ ] No new npm dependencies
6. [ ] Task 4 completed (TIM + plugin version) — tracked, not optional

## Out of scope (v1.1+)

- eslint JSON profile
- PostToolUse hook (phase 2 — only if skill compliance fails in practice)
- Playwright / MCP snapshot extract
