# o9k bundle-bench — measure companion combos instead of believing in them

The o9k companion bundles (`minimal` / `recommended` / `max` in
`plugins/o9k-core/compat/registry.json`) started as best-guess curation. This
benchmark turns them into **measured** curation, borrowing the loop from
[karpathy/autoresearch](https://github.com/karpathy/autoresearch): mutate the
setup → run a fixed workload → keep or discard by the numbers.

- **Mutation** = the companion combo installed in a sandboxed
  `CLAUDE_CONFIG_DIR` (never your live `~/.claude`)
- **Fixed workload** = the 5 tasks in `tasks/` (orient, trace, edit, debug,
  digest), run against a pinned clone of this repo (`bench-target-v1`)
- **Metric** = tasks passed first, then cost (tokens/USD from `claude -p`
  JSON output). Cheaper only counts at equal-or-better pass count.
- **Keep/discard** = ablation, not brute force: baseline → each companion
  alone → greedy-combine the winners. ~15 runs for 8 companions, not 256.

## Running

See the `bundle-bench` skill (o9k-recon plugin) for the full protocol —
sandbox setup, combo installation, ablation order. The mechanical part:

```bash
benchmarks/run-bench.sh <combo-name> <sandbox-config-dir> [model] [--repeat N]
```

One run = 5 non-interactive Claude sessions. **This costs real tokens** —
budget roughly a normal working session per combo (× N with `--repeat`).

## Comparing runs

Never diff two result JSONs by eye — `total_cost_usd` hides where the money
goes, and a delta between incomparable runs is meaningless:

```bash
node benchmarks/bench-compare.mjs <baseline.json> <candidate.json> [--json]
```

It refuses runs whose `tasks_hash`/`target_ref`/`model` differ (exit 2),
splits cost into output vs cache-read vs cache-write, flags a saturated task
set, and withholds a verdict below `--repeat 3`. The price model it uses is
self-checking: if it stops explaining the reported cost within 2%, it warns
instead of printing a confident wrong breakdown.

What it currently says about o9k's own pillars is documented in
**[docs/EVIDENCE.md](../docs/EVIDENCE.md)** — including the finding that
output tokens are only ~14% of spend while cache tokens are ~85%.

## Sample size — read before quoting numbers

A single run per combo (the default, and what the committed results in
`results/` are) is a **smoke signal, not a measurement** — LLM runs are
noisy in pass/fail, turns, and cost. Use `--repeat 3` (or more) before
drawing comparative conclusions; the result JSON then carries per-task
`pass_rate` and `cost_mean`/`min`/`max` under `task_summary`. Only compare
runs with the same `tasks_hash`, model, and repeat count.

## Contributing results

Ran a combo we haven't measured — or found a new companion worth testing?
Open a PR adding your `results/<combo>-<model>-<date>.json`. Results are only
comparable when `tasks_hash`, `target_ref` and `model` match; the runner
stamps all three. See `results/SCHEMA.md`.

Best measured combo graduates into the `bundles` block of the registry.
