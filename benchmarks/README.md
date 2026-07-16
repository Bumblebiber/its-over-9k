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
benchmarks/run-bench.sh <combo-name> <sandbox-config-dir> [model]
```

One run = 5 non-interactive Claude sessions. **This costs real tokens** —
budget roughly a normal working session per combo.

## Contributing results

Ran a combo we haven't measured — or found a new companion worth testing?
Open a PR adding your `results/<combo>-<model>-<date>.json`. Results are only
comparable when `tasks_hash`, `target_ref` and `model` match; the runner
stamps all three. See `results/SCHEMA.md`.

Best measured combo graduates into the `bundles` block of the registry.
