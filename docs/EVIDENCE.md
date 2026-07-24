# Evidence — what o9k has actually measured

o9k's pitch is efficiency. Efficiency claims are checkable, so this page
states exactly what has been measured, what the numbers say, and what is
still belief. It is deliberately unflattering where the data is unflattering.

**Bottom line as of 2026-07-24:** the one benchmark that isolates o9k's own
pillars shows them costing **+19% more** than no framework at all, with equal
task success. The efficiency claim is currently **unproven, and the only
direct evidence points the wrong way.**

Everything below is reproducible from the committed result JSONs:

```bash
node benchmarks/bench-compare.mjs \
  benchmarks/results/bare-sonnet-2026-07-16.json \
  benchmarks/results/o9k-pillars-sonnet-2026-07-16.json
```

---

## 1. The measurement

Three combos, 5 tasks, one run each, Sonnet, 2026-07-16, task set
`ffd5d80deff9` against `bench-target-v1`.

| Combo | Passed | Cost | vs bare | Output tokens | vs bare | Turns |
|---|---|---|---|---|---|---|
| `bare` (no framework) | 5/5 | $1.030 | — | 9.784 | — | 48 |
| `o9k-pillars` (o9k alone) | 5/5 | **$1.222** | **+19%** | **11.705** | **+20%** | 47 |
| `o9k-full` (pillars + companions) | 5/5 | $1.115 | +8% | 8.156 | −17% | 39 |

`o9k-pillars` is defined in the `bundle-bench` skill as the combo that
"measures o9k's own overhead/payoff". It is worse than bare on both axes:
more expensive **and** more verbose, despite caveman being active.

Two further readings of the same table:

- **The only improvement comes from the companions, not from o9k.** `o9k-full`
  is the sole combo that beats bare on output tokens and turns — and its
  delta over `o9k-pillars` is the third-party tools, not the doctrine.
- **The task set cannot show quality at all.** 5/5 everywhere. It measures
  cost and nothing else, so "makes agents better" is not merely unproven
  here — it is unmeasurable with this suite.

### Caveats that cut in o9k's favour

- **n=1.** One run per task. `benchmarks/README.md` says this is a smoke
  signal, not a measurement, and that is correct. The +19% could be noise.
- **One model, one day, one repo.** Sonnet, on o9k's own codebase.
- **`o9k-full`'s sandbox contents were never recorded** — so its win is not
  even attributable to specific companions. (Fixed going forward:
  `run-bench.sh` now stamps a `sandbox` block into every result.)

None of these caveats turn a +19% into a saving. They mean the honest
statement is *"we don't know yet"*, not *"it works"*.

---

## 2. Where the money actually goes

This is the part that changes strategy, and it is not a caveat — it is
arithmetic that reconciles with the reported costs to within 0.34%.

Modelling the four token classes at $3 / $15 / $0.30 / $6 per million
(input / output / cache read / cache write at the 1h TTL) reproduces
`total_cost_usd` from the raw token counts:

| Combo | Modeled | Reported | Error |
|---|---|---|---|
| `bare` | $1.02701 | $1.03045 | −0.334% |
| `o9k-pillars` | $1.22177 | $1.22177 | **0.000%** |
| `o9k-full` | $1.11503 | $1.11503 | **0.000%** |

So the split is not an estimate. It is:

| Cost line | bare | o9k-pillars | o9k-full |
|---|---|---|---|
| Cache **write** | **49.2%** | **51.3%** | **58.3%** |
| Cache **read** | 36.4% | 34.3% | 30.7% |
| **Output** | 14.3% | 14.4% | 11.0% |
| Input | 0.03% | 0.02% | 0.02% |

**Cache tokens are ~85% of the bill. Output is ~14%.**

### What follows from that

1. **caveman optimises the smallest line item.** Even a perfect 60% output
   reduction removes ~8.6% of the bill. The compounding argument ("output
   becomes future input") is real but damped: that future input returns as
   *cache reads* at $0.30/M, i.e. 2% of the output price.
2. **o9k's own overhead lands on the most expensive line.** Cache writes:
   bare 84.283 → `o9k-pillars` 104.481 tokens, **+24%**. The SessionStart
   doctrine injection, the skill loads and the extra context all have to be
   written into the cache at $6/M — twenty times the read price. The
   framework spends on the expensive line to save on the cheap one.
3. **Turns are the master variable.** Across the 15 task rows,
   turns↔cache-read correlate at r=0.978 (structural: every turn re-reads the
   whole context), and cache read+write is 85% of cost. The single biggest
   lever on spend is **finishing in fewer turns**, not saying less per turn.

The clearest illustration is `t1-orient`:

| Combo | Turns | Output | Cache read | Cost |
|---|---|---|---|---|
| bare | 21 | 4.941 | 614.647 | $0.374 |
| o9k-pillars | 21 | 5.657 | 766.374 | $0.504 |
| o9k-full | **10** | 2.389 | 294.588 | **$0.255** |

`o9k-full` did not win by being terse. It won by needing **half the turns**.
`o9k-pillars` used the same 21 turns as bare and simply added overhead on top.

> Caveat on the correlations: 15 rows spanning 5 different tasks are
> confounded by task size — a bigger task has more of everything. The
> turns↔cache-read link is mechanical rather than a discovery; the cost
> shares are exact.

---

## 3. Claims and their status

| Claim | Status | Evidence |
|---|---|---|
| Output compression saves ~50–65% output tokens | **Inherited from upstream [caveman](https://github.com/JuliusBrussee/caveman), never measured in o9k** | o9k's own run shows +20% output for `o9k-pillars` |
| "~40%+ total conversation savings" | **Not supported** | Output is 14% of cost; the arithmetic cannot reach 40% |
| Combining pillars multiplies the effect | **Untested hypothesis** | No per-pillar ablation has ever been run |
| o9k makes agents *better* (quality) | **Unmeasurable with the current suite** | 5/5 in every combo |
| Roster limit-handoff prevents blocked sessions | **Plausible, unmeasured** | Mechanism is deterministic code; no before/after study |
| One-owner-per-concern prevents collisions | **Design property, not a metric** | `compat/registry.json` + arbitration table |

---

## 4. What would settle it

In priority order — each is cheap relative to what it decides:

1. **Per-pillar ablation** (`bare` → `core` → `+caveman` → `+scout` →
   `+dispatch`), `--repeat 5`. Currently the pillars are only ever measured
   as one blob, so a pillar that actively hurts is invisible. This is the
   single highest-value run and it is the one that has never been done.
2. **A task set that can fail.** Tasks where `bare` scores below 100%, so
   pass rate has room to move, plus a graded rubric rather than a binary
   check.
3. **A turn-count-focused variant of the doctrine.** If turns dominate cost,
   the doctrine should be optimised for finishing early, not for terseness.
   Measure it against the current doctrine.

Until at least (1) is done, the README does not claim a percentage, and
neither should any writeup of this project.
