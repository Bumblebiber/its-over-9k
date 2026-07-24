#!/usr/bin/env node
// bench-compare.mjs — compare two bundle-bench result JSONs honestly.
//
// usage: node bench-compare.mjs <baseline.json> <candidate.json> [--json]
//
// Three jobs, in order of importance:
//
//   1. REFUSE incomparable runs. Different tasks_hash / target_ref / model
//      means the numbers are unrelated, no matter how tempting the delta.
//   2. DECOMPOSE the cost. `total_cost_usd` alone hides where the money goes;
//      a framework that trades output tokens for cache writes can look cheap
//      per token and still cost more. Cache writes are the expensive line.
//   3. WITHHOLD a verdict when the sample is too small. n=1 per task is a
//      smoke signal; this tool says so instead of crowning a winner.
//
// Zero dependencies, read-only.

import fs from "node:fs";

// Per-million USD. Cache writes are priced at the 1h-TTL rate, which is what
// Claude Code used for the committed 2026-07-16 results: reconciling these
// constants against `total_cost_usd` reproduces two of the three runs to
// 0.000% and the third to 0.33%. `reconcile()` below re-checks that on every
// comparison, so a pricing drift shows up as a warning instead of a silently
// wrong decomposition.
const DEFAULT_PRICES = { input: 3, output: 15, cache_read: 0.3, cache_write: 6 };

// Comparability keys: a delta across any of these is meaningless.
const MUST_MATCH = ["tasks_hash", "target_ref", "model"];

// Below this many runs per task, pass-rate and cost deltas are dominated by
// LLM noise. Matches the guidance in benchmarks/README.md.
const MIN_REPEATS_FOR_VERDICT = 3;

export function readResult(file) {
  const r = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(r.tasks)) throw new Error(`${file}: no tasks[] array`);
  return r;
}

/** Sum the four token classes across every task row. */
export function totals(result) {
  const t = { input: 0, output: 0, cache_read: 0, cache_write: 0, turns: 0, cost: 0 };
  for (const row of result.tasks) {
    t.input += row.input_tokens || 0;
    t.output += row.output_tokens || 0;
    t.cache_read += row.cache_read_tokens || 0;
    t.cache_write += row.cache_creation_tokens || 0;
    t.turns += row.turns || 0;
    t.cost += row.cost_usd || 0;
  }
  return t;
}

/** Cost per token class, in USD. */
export function decompose(tok, prices = DEFAULT_PRICES) {
  const d = {
    input: (tok.input * prices.input) / 1e6,
    output: (tok.output * prices.output) / 1e6,
    cache_read: (tok.cache_read * prices.cache_read) / 1e6,
    cache_write: (tok.cache_write * prices.cache_write) / 1e6,
  };
  d.modeled_total = d.input + d.output + d.cache_read + d.cache_write;
  return d;
}

/**
 * Does the price model still explain the reported cost? Returns the relative
 * error; callers warn above `tolerance`. This is what keeps the decomposition
 * from quietly lying after a pricing change.
 */
export function reconcile(result, prices = DEFAULT_PRICES) {
  const tok = totals(result);
  const modeled = decompose(tok, prices).modeled_total;
  const reported = result.total_cost_usd ?? tok.cost;
  if (!reported) return { modeled, reported, error: null };
  return { modeled, reported, error: modeled / reported - 1 };
}

export function comparability(a, b) {
  const mismatches = MUST_MATCH.filter((k) => a[k] !== b[k]).map((k) => ({
    key: k,
    baseline: a[k],
    candidate: b[k],
  }));
  return { comparable: mismatches.length === 0, mismatches };
}

export function passRate(result) {
  const total = result.tasks.length;
  const passed = result.tasks.filter((t) => t.pass).length;
  return { passed, total, rate: total ? passed / total : 0 };
}

function repeatsOf(result) {
  // Prefer the stamped field; fall back to counting rows per task for results
  // written before `repeats` existed.
  if (typeof result.repeats === "number") return result.repeats;
  const perTask = new Map();
  for (const t of result.tasks) perTask.set(t.task, (perTask.get(t.task) || 0) + 1);
  return Math.min(...perTask.values(), Infinity) || 1;
}

/**
 * The verdict. Pass count ranks first and cost only breaks ties — the rule
 * from results/SCHEMA.md. At small n the verdict is deliberately withheld:
 * "cheaper" from one run per task is not a finding.
 */
export function verdict(a, b) {
  const pa = passRate(a);
  const pb = passRate(b);
  const ca = a.total_cost_usd ?? totals(a).cost;
  const cb = b.total_cost_usd ?? totals(b).cost;
  const n = Math.min(repeatsOf(a), repeatsOf(b));
  const underpowered = n < MIN_REPEATS_FOR_VERDICT;

  let ranking;
  if (pb.rate > pa.rate) ranking = "candidate";
  else if (pb.rate < pa.rate) ranking = "baseline";
  else if (cb < ca) ranking = "candidate";
  else if (cb > ca) ranking = "baseline";
  else ranking = "tie";

  return {
    ranking,
    decided_by: pb.rate === pa.rate ? "cost (equal pass count)" : "pass count",
    repeats: n,
    underpowered,
    // The only honest headline at n<3.
    headline: underpowered
      ? `SMOKE SIGNAL ONLY — ${n} run(s) per task. Re-run with --repeat ${MIN_REPEATS_FOR_VERDICT} before quoting this.`
      : `${ranking} wins on ${pb.rate === pa.rate ? "cost" : "pass count"}.`,
    saturated: pa.rate === 1 && pb.rate === 1,
  };
}

export function compare(a, b, prices = DEFAULT_PRICES) {
  const ta = totals(a);
  const tb = totals(b);
  return {
    baseline: a.combo,
    candidate: b.combo,
    comparability: comparability(a, b),
    pass: { baseline: passRate(a), candidate: passRate(b) },
    tokens: { baseline: ta, candidate: tb },
    cost: {
      baseline: decompose(ta, prices),
      candidate: decompose(tb, prices),
    },
    reconcile: {
      baseline: reconcile(a, prices),
      candidate: reconcile(b, prices),
    },
    verdict: verdict(a, b),
  };
}

// ── formatting ────────────────────────────────────────────────────────────

const pct = (x) => (x === null || !Number.isFinite(x) ? "n/a" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
const usd = (x) => `$${x.toFixed(4)}`;
const delta = (base, cand) => (base === 0 ? null : cand / base - 1);

function shareRow(label, baseCost, candCost, baseTotal, candTotal) {
  return [
    label.padEnd(12),
    usd(baseCost).padStart(9),
    `${((baseCost / baseTotal) * 100).toFixed(1)}%`.padStart(7),
    usd(candCost).padStart(9),
    `${((candCost / candTotal) * 100).toFixed(1)}%`.padStart(7),
    pct(delta(baseCost, candCost)).padStart(8),
  ].join("  ");
}

export function format(c) {
  const L = [];
  L.push(`${c.baseline}  →  ${c.candidate}`);
  L.push("");

  if (!c.comparability.comparable) {
    L.push("NOT COMPARABLE — these runs do not measure the same thing:");
    for (const m of c.comparability.mismatches) {
      L.push(`  ${m.key}: ${m.baseline}  vs  ${m.candidate}`);
    }
    L.push("");
    L.push("Re-run both combos on the same task set, target ref and model.");
    return L.join("\n");
  }

  for (const [side, r] of Object.entries(c.reconcile)) {
    if (r.error !== null && Math.abs(r.error) > 0.02) {
      L.push(
        `WARNING (${side}): price model explains only ${pct(r.error)} off the reported cost ` +
          `(modeled ${usd(r.modeled)} vs reported ${usd(r.reported)}). ` +
          `Prices likely drifted — the decomposition below is indicative only.`
      );
      L.push("");
    }
  }

  const pb = c.pass.baseline;
  const pc = c.pass.candidate;
  L.push(`passed        ${pb.passed}/${pb.total}  →  ${pc.passed}/${pc.total}`);
  L.push(
    `turns         ${c.tokens.baseline.turns}  →  ${c.tokens.candidate.turns}  ` +
      `(${pct(delta(c.tokens.baseline.turns, c.tokens.candidate.turns))})`
  );
  L.push("");

  const bt = c.cost.baseline.modeled_total;
  const ct = c.cost.candidate.modeled_total;
  L.push("cost by token class      baseline          candidate       delta");
  for (const k of ["output", "cache_read", "cache_write", "input"]) {
    L.push("  " + shareRow(k, c.cost.baseline[k], c.cost.candidate[k], bt, ct));
  }
  L.push("  " + "total".padEnd(12) + usd(bt).padStart(9) + " ".repeat(8) + usd(ct).padStart(9) + " ".repeat(8) + pct(delta(bt, ct)).padStart(8));
  L.push("");

  if (c.verdict.saturated) {
    L.push(
      "NOTE: every task passed in BOTH runs. This task set cannot show a quality " +
        "difference — it only measures cost. Do not read 'equal pass count' as 'equal quality'."
    );
    L.push("");
  }

  L.push(`verdict: ${c.verdict.headline}`);
  if (!c.verdict.underpowered) L.push(`  decided by: ${c.verdict.decided_by}`);
  return L.join("\n");
}

// ── cli ───────────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv.filter((a) => a !== "--json");
  const asJson = argv.includes("--json");
  if (args.length < 2) {
    process.stderr.write("usage: bench-compare.mjs <baseline.json> <candidate.json> [--json]\n");
    return 64;
  }
  const a = readResult(args[0]);
  const b = readResult(args[1]);
  const c = compare(a, b);
  process.stdout.write((asJson ? JSON.stringify(c, null, 2) : format(c)) + "\n");
  // Exit 2 on incomparable input so scripts and CI cannot ignore it.
  return c.comparability.comparable ? 0 : 2;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
