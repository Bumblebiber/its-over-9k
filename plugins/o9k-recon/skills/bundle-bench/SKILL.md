---
name: bundle-bench
description: "Benchmark companion combos on a fixed task set to find the best-measured o9k bundle. Use when the user wants to test/compare companion combinations, validate the existing setup with numbers, or contribute benchmark results back to the o9k repo. Wraps benchmarks/run-bench.sh with sandbox isolation and an ablation plan."
---

# bundle-bench — measured bundles, not believed ones

The framework-scout trial (Step 4) answers "is this ONE candidate clean and
cheap in isolation?". This skill answers the next question: **which
COMBINATION of companions actually performs best?** Same philosophy as
[karpathy/autoresearch](https://github.com/karpathy/autoresearch): mutate the
setup, run a fixed workload, keep or discard by the numbers, repeat.

**This is expensive.** One combo = 5 non-interactive Claude sessions
(`benchmarks/run-bench.sh`); a full ablation over 8 companions ≈ 15 combos.
Never run it casually, never run it on the live config. Get explicit user
sign-off on the combo list (= the budget) before the first run.

## Ground rules (inherited from the trial protocol)

1. **The live `~/.claude` is never the test bench.** Every run uses a
   sandboxed `CLAUDE_CONFIG_DIR`. The runner refuses `~/.claude` outright.
2. **Numbers beat claims.** A combo "feels better" is not a result; the
   result JSON is.
3. **Comparable or worthless.** Only runs with identical `tasks_hash`,
   `target_ref` and `model` compare. The runner stamps all three.

## Step 1 — Sandbox per combo

```bash
export SB=/tmp/o9k-bench-sandbox-<combo>
mkdir -p "$SB"
cp ~/.claude/.credentials.json "$SB"/ 2>/dev/null || true   # auth only, nothing else
```

Then install **exactly** the combo under test into the sandbox — plugins via
`CLAUDE_CONFIG_DIR=$SB claude plugin install …`, MCP servers via
`CLAUDE_CONFIG_DIR=$SB claude mcp add … --scope user`. Record versions; the
PR needs them. The `bare` baseline gets credentials and nothing else.

## Step 2 — Ablation plan (not brute force)

2^n combos is waste. Run in this order, stop early when the picture is clear:

1. `bare` — no plugins, no MCP. The floor.
2. `o9k-pillars` — the 6 pillars alone. Measures o9k's own overhead/payoff.
3. `o9k+<companion>` — pillars + ONE companion each (serena, hmem,
   superpowers, context7, ponytail, …). Measures each companion's marginal
   value.
4. Greedy: take the best single additions, combine them, measure again.
   A companion that helped alone but not in combination is redundancy —
   that's a finding, record it.

## Step 3 — Run

```bash
benchmarks/run-bench.sh <combo-name> "$SB" [model]
```

Dispatch doctrine applies: drive long ablation series from a background
subagent; only the result JSONs belong in main context. Pin the model across
the whole series.

## Step 4 — Verdict & upstream

- Rank by `passed`, tie-break by cost (see `results/SCHEMA.md`).
- The winning combo is a **proposal** for the `bundles` block in
  `plugins/o9k-core/compat/registry.json` — registry changes still need the
  one-owner-per-concern rule and a human merge, numbers don't override
  conflicts.
- **Contribute:** commit the `benchmarks/results/*.json` files and open a PR
  against the o9k repo. State the exact sandbox contents (plugins + MCP
  servers, versions) in the PR body. This is how the community grows the
  measured map — new companions welcome, measured ones more so.
- Teardown: delete the sandboxes. Prove the live `~/.claude` untouched if
  anything looks off.

## Anti-patterns

- **Don't** benchmark on the live config "because the sandbox is work" —
  that invalidates the run AND risks the setup.
- **Don't** compare across models or task-set versions. Re-run instead.
- **Don't** let a cheap-but-failing combo win — pass count ranks first,
  always.
- **Don't** start a full ablation without telling the user what it costs.
