# Remediation plan — 2026-07-24 project review

Response to the seven findings from the 2026-07-24 review. Same format as the
2026-07-18 Fixauftrag: problem → where → what to do, ordered by priority, with
each item marked **done** / **needs a run** / **needs a decision**.

Three categories, because they cost different things:

- **done** — fixed in this pass, no budget, no decision needed.
- **needs a run** — the fix is a benchmark that costs real API tokens. The
  tooling is ready; the money is not spent.
- **needs a decision** — a product call only the maintainer can make.

---

## P1 — the credibility problem

### 1. The headline claim contradicts the only measurement — **done**

**Problem.** README advertised "~50–65% fewer output tokens" and "~40%+ total
conversation savings". The one committed run that isolates o9k's own pillars
(`o9k-pillars`) shows **+19% cost and +20% output tokens** versus `bare`, at
equal pass count. The figure was inherited from upstream caveman and never
measured in o9k — the 2026-07-18 Fixauftrag (item 13) already noticed this and
only fixed the *sample-size* wording, not the claim itself.

**Where.** `README.md`, `plugins/o9k-caveman/skills/caveman/SKILL.md`.

**Done.**
- `docs/EVIDENCE.md` — new: every claim with its status (measured / inherited
  / untested / unmeasurable), the committed numbers, and the caveats that cut
  in o9k's favour.
- README: percentage claims removed; a "Does it work? — the honest answer"
  section carries the actual table; "Why combining multiplies" relabelled as
  the hypothesis it is.
- caveman SKILL: "~60% → ~40% savings" replaced with the real arithmetic and
  a better reason to compress (a short answer is a better answer).

### 2. Cost was being optimised on the wrong axis — **done**

**Problem.** The whole doctrine is built on "output tokens are expensive".
Decomposing the committed results says otherwise:

| Cost line | bare | o9k-pillars | o9k-full |
|---|---|---|---|
| Cache write | 49.2% | 51.3% | 58.3% |
| Cache read | 36.4% | 34.3% | 30.7% |
| Output | 14.3% | 14.4% | 11.0% |

The price model ($3/$15/$0.30/$6 per M, cache write at 1h TTL) reproduces
`total_cost_usd` to 0.000% on two runs and 0.334% on the third, so this is
arithmetic, not estimation. Consequences:

- caveman optimises ~14% of the bill; perfect 60% compression removes <9%.
- o9k's own doctrine injection lands on cache **writes** — the $6/M line,
  20× the read price. `o9k-pillars` writes +24% more cache than `bare`.
- Turns are the master variable (turns↔cache-read r=0.978, and cache is 85%
  of spend). `o9k-full` won `t1-orient` by halving turns (21→10), not by
  being terse.

**Done.** Documented in `docs/EVIDENCE.md` §2 and enforced in tooling:
`bench-compare.mjs` always prints the decomposition, and `run-bench.sh` now
records cache/turn totals instead of output tokens alone.

**Follow-up (needs a decision):** if turns dominate, the doctrine should be
optimised for *finishing early*, not for terseness. That is a rewrite of the
core pitch, not a doc fix — see item 8.

### 3. The benchmark cannot measure quality — **needs a run**

**Problem.** 5/5 in all three combos. A saturated suite measures cost only, so
"makes agents better" is unmeasurable with it, and "equal pass count" gets
misread as "equal quality".

**Where.** `benchmarks/tasks/`.

**Done so far.** `bench-compare.mjs` detects saturation and prints the caveat;
the bundle-bench skill tells the runner to state it in the PR.

**To do — a v2 task set.** Ordered:
1. Add 3–4 tasks where `bare` is expected to score below 100%: a multi-file
   refactor with a hidden call site; a "find why this test is flaky" task; a
   task with a deliberately misleading README; a task whose answer requires
   reading two files that never mention each other.
2. Replace binary `check.sh` with a graded rubric (0–3) so partial credit is
   visible: passes tests / passes tests without touching fixtures / plus no
   unrelated edits / plus correct explanation.
3. Bump `MANIFEST.json` `version` to 2. This changes `tasks_hash`, so v1
   results become incomparable — that is correct and intended; keep the v1
   JSONs for the record and re-run the baselines.

**Blocked on:** budget sign-off (a v2 baseline at `--repeat 5` is ~5 combos ×
5 tasks × 5 = 125 sessions).

---

## P2 — the unproven core

### 4. The pillars have never been ablated individually — **needs a run**

**Problem.** `o9k-pillars` is measured as one blob, so a pillar that actively
costs more than it saves is invisible. This is why the +19% sat unnoticed: no
result attributes it to caveman, scout, dispatch or memory.

**Done.** `plugins/o9k-recon/skills/bundle-bench/SKILL.md` Step 2 now
prescribes the pillar ablation (`o9k-core` → `+caveman` → `+scout` →
`+dispatch` → `+memory`) **before** any companion work, and says a pillar
losing to `bare` at `--repeat 5` is a bug report, not a bundle candidate.
`bench-compare.mjs` withholds a verdict below `--repeat 3`.

**To do.** Run it. ~7 combos × `--repeat 5` = 175 sessions. This is the single
highest-value run available and it has never been done.

**Expected outcomes, all useful:** a pillar that pays for itself (keep and
finally quote a number); one that is noise (keep, stop claiming); one that
loses (fix the doctrine or drop the pillar).

### 5. The doctrine is prompt-hope without verification — **needs a decision**

**Problem.** `session-start.mjs` escalates rhetorically ("MANDATORY, not a
suggestion… that's not a pass") — the pattern that appears when compliance
isn't measurable and intensity substitutes for evidence. Meanwhile modern
harnesses already do search-before-read and subagent isolation natively, so
part of the injected doctrine may be paying cache-write rent for advice the
model would follow anyway.

**Options.**
- **(a) Measure adherence.** Extend `o9k-stats.mjs` to report proxies from the
  transcripts: output tokens per turn, reads-before-searches ratio, subagent
  dispatch count. Compare doctrine-on vs doctrine-off on the same tasks.
  Cheap — the transcripts already exist, no API spend.
- **(b) Shrink the injection.** The hook currently pays cache-write cost every
  session. Test a minimal variant (one sentence + skill names) against the
  full text; if the effect is equal, the difference is pure saving.
- **(c) Retarget it at turns** (see item 2). "Finish in as few turns as
  possible; don't re-read what you've read" instead of "compress your prose".

Recommendation: (a) first — it costs nothing and decides (b) and (c).

---

## P3 — surface and scope

### 6. Statusline auto-wiring was unmaintainable — **done (2026-07-24)**

**Problem.** 828 LOC writing into three hosts' config formats, including
**source-patching** `~/.hermes/hermes-agent/cli.py` through three regex
anchors designed to interleave with TIM's patch of the same file. It already
had a `"cli.py anchor not found"` failure path. Any host release could break
it silently. None of it served the token-efficiency thesis.

**Decision (maintainer, 2026-07-24):** remove the wiring, keep the renderer.

**Done.**
- Deleted: `statusline/wire-{claude,cursor,hermes,codex,opencode}.mjs`,
  `wire-all.mjs`, `command-path.mjs`, `hermes-o9k-statusline.sh`, and the
  three wiring test files.
- Kept: the renderer (`o9k-statusline.mjs`, `render`, `marquee`, `normalize`,
  `config`, `segments/*`) — it reads o9k's own `~/.o9k/usage.json` and treats
  the host payload defensively, so it has no upstream to chase. It is also the
  only visible surface of the usage collector, which is the strongest part of
  the product.
- **Removal path kept deliberately:** `statusline/legacy-cleanup.mjs` still
  recognises and reverses what o9k ≤ 0.10.x wrote, so existing installs get a
  clean uninstall instead of being stranded. It matches text o9k itself wrote,
  so upstream changes cannot break it.
- `o9k-doctor` no longer *demands* wiring; it reports leftovers as `legacy`
  and only complains when a legacy command points at a path that no longer
  exists. No longer gated on `~/.o9k/statusline.json`, so a disabled config
  doesn't hide a stale entry.
- `o9k-init` may no longer offer or perform statusline wiring, anywhere.
- **Renderer fix caught in the process:** `loadConfig()` returns `null` with
  no config file, and the init interview used to be the only writer — so
  after removing the wiring the statusline would have rendered *nothing* with
  no hint why. It now falls back to `defaultConfig()`; an explicit
  `enabled: false` still wins. The user pasting the command is the opt-in.
- `docs/STATUSLINE.md` — dated (2026-07-24) copy-paste snippet for Claude and
  Cursor, Hermes explicitly unsupported, Codex/OpenCode have no API.
- The four statusline design docs carry a SUPERSEDED banner rather than being
  deleted, matching how the 2026-07-18 Fixauftrag is kept as a record.

### 7. Results were not reproducible — **done**

**Problem.** `results/SCHEMA.md` rule 3 requires stating the sandbox contents
"in the PR description" — a promise nobody keeps. The committed `o9k-full`
result, the only combo that beat `bare`, has no record of what was in it. Its
win is unattributable.

**Done.** `run-bench.sh` stamps a `sandbox` block (enabled plugins, MCP server
names, free-text `--sandbox-note`) into every result and warns when the note
is missing. Read from the sandbox config file directly — never by invoking
`claude`, since some of those subcommands dial out to MCP servers and can hang
a benchmark run. Schema and skill updated.

### 8. Positioning inverts the actual strengths — **needs a decision**

**Problem.** The README leads with token efficiency (weakest evidence) and
buries arbitration and the roster (strongest, most defensible). The project's
own commit history agrees: 2.957 LOC of roster, 4.058 of core plumbing, 0 LOC
and 218 markdown lines for the three doctrine pillars that carry the pitch.

**Partially done.** The "Does it work?" section now says plainly that what is
solid is the arbitration layer and the roster's limit-handoff, not the token
math.

**Still a decision.** A real repositioning — "operations layer for a
multi-CLI agent fleet, with an efficiency doctrine attached" instead of "meta
framework for token efficiency" — touches the tagline, the pillar table, and
arguably the project name. Not something to do behind the maintainer's back.
Recommend deciding it *after* item 4's ablation, which may hand you a real
efficiency number to lead with instead.

### 9. Not addressed here

- **Bus factor 1 / TIM dependency.** `o9k-memory` prefers TIM, which is
  unpublished, and both memory backends are the author's own. Structural, not
  fixable by a patch.
- **Compression vs reasoning quality.** caveman may cost output quality
  because the model's prose is also its scratchpad. Item 3's rubric is the
  prerequisite for measuring it — noted so it isn't forgotten.
- **Host-surface freeze.** Recommended (no sixth host, no new host-config
  writers until the existing integrations survive one upstream release cycle),
  but that is a policy for the maintainer to adopt, not a code change.

---

## Suggested order

1. **Item 5(a)** — adherence proxies in `o9k-stats`. No API spend, tells you
   whether the doctrine is even being followed.
2. **Item 4** — pillar ablation at `--repeat 5`. The run that decides whether
   o9k's core thesis holds.
3. **Item 3** — v2 task set, only once (4) shows the suite is worth extending.
4. **Item 8** — reposition with whatever (2)–(4) actually proved.
