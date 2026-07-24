// bench-compare.mjs tests — synthetic cases for the logic, plus a
// reconciliation check against the committed 2026-07-16 results.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  totals,
  decompose,
  reconcile,
  comparability,
  passRate,
  verdict,
  compare,
  format,
  readResult,
} from "./bench-compare.mjs";

const RESULTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "results");

function row(over = {}) {
  return {
    task: "t1-orient",
    rep: 1,
    pass: true,
    turns: 5,
    cost_usd: 0.1,
    input_tokens: 10,
    output_tokens: 1000,
    cache_read_tokens: 100000,
    cache_creation_tokens: 10000,
    ...over,
  };
}

function result(over = {}) {
  return {
    combo: "x",
    model: "sonnet",
    tasks_hash: "aaaa",
    target_ref: "bench-target-v1",
    repeats: 1,
    total_cost_usd: 0.1,
    tasks: [row()],
    ...over,
  };
}

test("totals sums every token class and turns across rows", () => {
  const r = result({ tasks: [row(), row({ output_tokens: 500, turns: 3 })] });
  const t = totals(r);
  assert.equal(t.output, 1500);
  assert.equal(t.cache_read, 200000);
  assert.equal(t.cache_write, 20000);
  assert.equal(t.turns, 8);
});

test("decompose prices each class separately", () => {
  const d = decompose({ input: 0, output: 1e6, cache_read: 0, cache_write: 0 });
  assert.equal(d.output, 15);
  const d2 = decompose({ input: 0, output: 0, cache_read: 1e6, cache_write: 1e6 });
  assert.equal(d2.cache_read, 0.3);
  assert.equal(d2.cache_write, 6);
  // Cache writes cost 20x what cache reads cost — the reason a framework can
  // shrink output tokens and still get more expensive.
  assert.equal(d2.cache_write / d2.cache_read, 20);
});

test("reconcile reports relative error against the reported cost", () => {
  // 1000 out + 100k read + 10k write + 10 in
  //   = 0.015 + 0.03 + 0.06 + 0.00003 = 0.10503
  const r = result({ total_cost_usd: 0.10503 });
  const rec = reconcile(r);
  assert.ok(Math.abs(rec.error) < 1e-9, `expected exact match, got ${rec.error}`);
});

test("comparability refuses runs that differ in hash, ref or model", () => {
  const a = result();
  assert.equal(comparability(a, result()).comparable, true);
  assert.equal(comparability(a, result({ model: "opus" })).comparable, false);
  assert.equal(comparability(a, result({ tasks_hash: "bbbb" })).comparable, false);
  const m = comparability(a, result({ target_ref: "v2", model: "opus" })).mismatches;
  assert.deepEqual(m.map((x) => x.key).sort(), ["model", "target_ref"]);
});

test("passRate counts rows across repeats", () => {
  const r = result({ tasks: [row(), row({ pass: false }), row()] });
  assert.deepEqual(passRate(r), { passed: 2, total: 3, rate: 2 / 3 });
});

test("verdict withholds a winner below 3 repeats", () => {
  const v = verdict(result(), result({ combo: "y", total_cost_usd: 0.05 }));
  assert.equal(v.underpowered, true);
  assert.match(v.headline, /SMOKE SIGNAL/);
});

test("verdict ranks pass count first, cost only as tie-break", () => {
  const cheap_but_failing = result({
    combo: "cheap",
    repeats: 3,
    total_cost_usd: 0.01,
    tasks: [row({ pass: false })],
  });
  const dear_but_passing = result({ combo: "dear", repeats: 3, total_cost_usd: 9 });
  // Baseline passes, candidate is cheaper but fails → baseline wins.
  const v = verdict(dear_but_passing, cheap_but_failing);
  assert.equal(v.ranking, "baseline");
  assert.equal(v.decided_by, "pass count");

  // Equal pass count → cost decides.
  const v2 = verdict(result({ repeats: 3, total_cost_usd: 1 }), result({ repeats: 3, total_cost_usd: 0.5 }));
  assert.equal(v2.ranking, "candidate");
  assert.match(v2.decided_by, /^cost/);
});

test("verdict flags a saturated task set", () => {
  const v = verdict(result({ repeats: 3 }), result({ repeats: 3 }));
  assert.equal(v.saturated, true);
});

test("repeats fall back to counting rows per task when unstamped", () => {
  const noRepeats = {
    ...result({ tasks: [row(), row({ rep: 2 }), row({ rep: 3 })] }),
  };
  delete noRepeats.repeats;
  assert.equal(verdict(noRepeats, noRepeats).repeats, 3);
});

test("format refuses to print deltas for incomparable runs", () => {
  const out = format(compare(result(), result({ model: "opus" })));
  assert.match(out, /NOT COMPARABLE/);
  assert.doesNotMatch(out, /verdict:/);
});

test("format warns when the price model stops explaining the reported cost", () => {
  // Reported cost 3x what the tokens imply → pricing drifted.
  const out = format(compare(result(), result({ combo: "y", total_cost_usd: 0.315 })));
  assert.match(out, /WARNING \(candidate\)/);
});

test("format surfaces the saturation caveat when everything passes", () => {
  const out = format(compare(result(), result({ combo: "y" })));
  assert.match(out, /cannot show a quality difference/);
});

// ── against the committed results ─────────────────────────────────────────
// These are the numbers the README's claims get checked against; if the
// files are regenerated with a different price regime, the reconciliation
// assertion is the tripwire.

const committed = (name) => path.join(RESULTS, name);
const haveCommitted = ["bare", "o9k-pillars", "o9k-full"].every((c) =>
  fs.existsSync(committed(`${c}-sonnet-2026-07-16.json`))
);

test("committed 2026-07-16 results reconcile with the price model", { skip: !haveCommitted }, () => {
  for (const combo of ["bare", "o9k-pillars", "o9k-full"]) {
    const r = readResult(committed(`${combo}-sonnet-2026-07-16.json`));
    const { error } = reconcile(r);
    assert.ok(
      Math.abs(error) < 0.005,
      `${combo}: price model off by ${(error * 100).toFixed(3)}% — update DEFAULT_PRICES`
    );
  }
});

test("o9k-pillars costs more than bare on the committed run", { skip: !haveCommitted }, () => {
  const bare = readResult(committed("bare-sonnet-2026-07-16.json"));
  const pillars = readResult(committed("o9k-pillars-sonnet-2026-07-16.json"));
  const c = compare(bare, pillars);
  assert.equal(c.comparability.comparable, true);
  // The finding docs/EVIDENCE.md is built on: same pass count, more output,
  // more cache writes, higher cost.
  assert.equal(c.pass.baseline.passed, c.pass.candidate.passed);
  assert.ok(c.tokens.candidate.output > c.tokens.baseline.output);
  assert.ok(c.tokens.candidate.cache_write > c.tokens.baseline.cache_write);
  assert.ok(c.cost.candidate.modeled_total > c.cost.baseline.modeled_total);
  assert.equal(c.verdict.underpowered, true);
});

test("cache writes dominate the bill in every committed run", { skip: !haveCommitted }, () => {
  for (const combo of ["bare", "o9k-pillars", "o9k-full"]) {
    const r = readResult(committed(`${combo}-sonnet-2026-07-16.json`));
    const d = decompose(totals(r));
    const outShare = d.output / d.modeled_total;
    const writeShare = d.cache_write / d.modeled_total;
    assert.ok(writeShare > outShare * 3, `${combo}: expected cache writes to dwarf output`);
    assert.ok(outShare < 0.2, `${combo}: output share ${(outShare * 100).toFixed(1)}% — EVIDENCE.md says <20%`);
  }
});
