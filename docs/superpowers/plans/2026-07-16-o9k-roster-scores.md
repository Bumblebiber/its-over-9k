# o9k-roster Scores Implementation Plan

> **For agentic workers:** TDD per task. Checkbox tracking. Spec:
> `docs/superpowers/specs/2026-07-16-o9k-roster-scores-design.md`.

**Goal:** Collect AA-via-OpenRouter scores + OpenRouter prices/open-weight
flags into `~/.o9k/roster-scores.json`, propose role-chain updates, semiauto
apply when score↑ and cost↛↑. Hosted open-weight only. Collectors in plugin.

**Tech:** Node ≥18 ESM, `node --test`, zero new deps. Network only in live
`refresh` (fixtures in tests).

---

### Task 1: Pure propose/apply gates

**Files:**
- Create: `plugins/o9k-roster/scripts/propose.mjs`
- Test: `plugins/o9k-roster/scripts/propose.test.mjs`

- [ ] **Step 1: Failing tests** for `blendedPrice`, `scoreForRole`,
  `proposeRoleChanges` (apply when Δscore≥min_delta & cost≤current; skip on
  cost-up; skip on `pin_head`; include open-weight hermes/opencode cells).
- [ ] **Step 2: Implement** until green.
- [ ] **Step 3: Commit** `feat(roster): propose/apply gates for score-backed chain updates`

---

### Task 2: Collectors (fixture-driven)

**Files:**
- Create: `plugins/o9k-roster/scripts/collectors/openrouter-benchmarks.mjs`
- Create: `plugins/o9k-roster/scripts/collectors/openrouter-models.mjs`
- Create: `plugins/o9k-roster/scripts/collectors/id-map.json`
- Create: `plugins/o9k-roster/scripts/collectors/fixtures/*.json` (minimal)
- Test: `plugins/o9k-roster/scripts/collectors/collectors.test.mjs`

- [ ] **Step 1: Tests** normalize fixture payloads → internal shape; detect
  open-weight; map ids via id-map.
- [ ] **Step 2: Implement** `normalizeBenchmarks`, `normalizeModels`,
  `isOpenWeight`, `mapId`. Live `fetch` only behind `fetchFn` injection.
- [ ] **Step 3: Commit** `feat(roster): OpenRouter benchmark + models collectors`

---

### Task 3: scores.mjs merge + roster CLI

**Files:**
- Create: `plugins/o9k-roster/scripts/scores.mjs`
- Modify: `plugins/o9k-roster/scripts/roster.mjs` (`refresh`, `propose`, `apply-scores`)
- Test: `plugins/o9k-roster/scripts/scores.test.mjs`

- [ ] **Step 1: Tests** merge collectors → `roster-scores.json` shape;
  `buildRoleScores`; refresh with `--fixture-dir` offline.
- [ ] **Step 2: Wire CLI** handlers; `O9K_SCORES` path override; backup before apply.
- [ ] **Step 3: Commit** `feat(roster): refresh/propose/apply-scores CLI + scores cache`

---

### Task 4: Skill + cron script + docs

**Files:**
- Create: `plugins/o9k-roster/skills/roster-refresh/SKILL.md`
- Create: `plugins/o9k-roster/scripts/roster-refresh-cron.sh`
- Modify: `plugins/o9k-roster/skills/roster/SKILL.md` (pointer)
- Modify: `docs/MULTI-AGENT.md`, `CHANGELOG.md` (0.10.2)
- Bump: `plugins/o9k-roster/.claude-plugin/plugin.json` → 0.2.0

- [ ] **Step 1: Write skill + cron script** (disk-first report).
- [ ] **Step 2: Docs + changelog.**
- [ ] **Step 3: Full test suite green; commit** `feat(roster): roster-refresh skill + cron script`

---

## Notes

- No AA HTML scrape. Harness-level Coding Agent Index = future collector.
- Cron registration stays in Overseer; plugin only ships the script contract.
