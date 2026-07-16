// Tests for roster.mjs pure selection logic. Hermetic: fixtures inline,
// no ~/.o9k access.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pick } from "./roster.mjs";

const ROSTER = {
  clis: { claude: { cmd: ["claude", "--model", "{model}", "{prompt}"] } },
  models: {
    "model-a": { provider: "anthropic", tier: "frontier", cli: ["claude"] },
    "model-b": { provider: "openai", tier: "high", cli: ["codex"] },
    "model-c": { provider: "deepseek", tier: "mid", cli: ["opencode"] },
  },
  roles: { planner: { chain: ["model-a", "model-b", "model-c"] } },
  limits: { warn_at: 0.9, handoff_at: 0.95 },
};

const NOW = Date.parse("2026-07-16T12:00:00Z");

test("pick returns first chain model when nothing is limited", () => {
  const r = pick({ roster: ROSTER, usage: null, role: "planner", now: NOW });
  assert.equal(r.model, "model-a");
  assert.equal(r.cli, "claude");
  assert.deepEqual(r.skipped, []);
});

test("pick skips provider at/over handoff threshold", () => {
  const usage = { providers: { anthropic: { used: 0.96 } } };
  const r = pick({ roster: ROSTER, usage, role: "planner", now: NOW });
  assert.equal(r.model, "model-b");
  assert.deepEqual(r.skipped, [{ model: "model-a", reason: "provider anthropic at 96%" }]);
});

test("pick skips models marked limited until TTL expiry, honors expiry", () => {
  const usage = {
    marked: {
      "model-a": { until: "2026-07-16T13:00:00Z" },
      "model-b": { until: "2026-07-16T11:00:00Z" },
    },
  };
  const r = pick({ roster: ROSTER, usage, role: "planner", now: NOW });
  assert.equal(r.model, "model-b"); // model-b's mark expired an hour ago
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].model, "model-a");
});

test("pick skips marks on a provider name (mark-limited <provider>)", () => {
  const usage = { marked: { openai: { until: "2026-07-16T13:00:00Z" } } };
  const r = pick({ roster: ROSTER, usage, role: "planner", now: NOW });
  assert.equal(r.model, "model-a");
  // provider mark only bites when the chain reaches an openai model:
  const usage2 = {
    marked: {
      "model-a": { until: "2026-07-16T13:00:00Z" },
      openai: { until: "2026-07-16T13:00:00Z" },
    },
  };
  const r2 = pick({ roster: ROSTER, usage: usage2, role: "planner", now: NOW });
  assert.equal(r2.model, "model-c");
});

test("pick skips chain entries missing from models", () => {
  const roster = { ...ROSTER, roles: { planner: { chain: ["ghost", "model-a"] } } };
  const r = pick({ roster, usage: null, role: "planner", now: NOW });
  assert.equal(r.model, "model-a");
  assert.deepEqual(r.skipped, [{ model: "ghost", reason: "not in models" }]);
});

test("pick returns model:null with full skip list when chain exhausted", () => {
  const usage = { providers: { anthropic: { used: 1 }, openai: { used: 1 }, deepseek: { used: 1 } } };
  const r = pick({ roster: ROSTER, usage, role: "planner", now: NOW });
  assert.equal(r.model, null);
  assert.equal(r.skipped.length, 3);
});

test("pick throws on unknown role", () => {
  assert.throws(() => pick({ roster: ROSTER, usage: null, role: "nope", now: NOW }), /unknown role/);
});
