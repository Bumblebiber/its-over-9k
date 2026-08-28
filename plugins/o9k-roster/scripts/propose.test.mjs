// Tests for propose.mjs semiauto gates. Hermetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blendedPrice,
  scoreForRole,
  proposeRoleChanges,
  applyProposals,
  buildCandidates,
} from "./propose.mjs";

test("blendedPrice uses 3:1 AA convention", () => {
  assert.equal(blendedPrice({ in: 1, out: 4 }), (3 * 1 + 4) / 4);
  assert.equal(blendedPrice(null), null);
});

test("scoreForRole picks primary field per role", () => {
  const s = { coding_index: 70, agentic_index: 50, intelligence_index: 40 };
  assert.equal(scoreForRole(s, "implementer"), 70);
  assert.equal(scoreForRole(s, "scout"), 50);
  assert.equal(scoreForRole(s, "summarizer"), 40);
  assert.equal(scoreForRole(s, "planner"), 50);
});

const ROSTER = {
  clis: {
    claude: { cmd: ["claude", "--model", "{model}", "{prompt}"] },
    hermes: { cmd: ["hermes", "chat", "-q", "{prompt}", "--model", "{model}"] },
    opencode: { cmd: ["opencode", "--model", "{model}", "--prompt", "{prompt}"] },
  },
  models: {
    "claude-sonnet-5": { provider: "anthropic", tier: "mid", cli: ["claude"], price: { in: 3, out: 15 } },
    "deepseek-v4-pro": { provider: "deepseek", tier: "mid", cli: ["hermes", "opencode"], price: { in: 0.3, out: 1.2 } },
  },
  roles: {
    implementer: { chain: ["claude:claude-sonnet-5"] },
    scout: { chain: ["claude:claude-sonnet-5"], pin_head: true },
  },
  scores: { min_delta: 2.0, cost_slack: 0 },
};

const SCORES = {
  models: {
    "claude-sonnet-5": {
      open_weight: false,
      price: { in: 3, out: 15 },
      scores: { coding_index: 65, agentic_index: 60, intelligence_index: 70 },
    },
    "deepseek-v4-pro": {
      open_weight: true,
      hosted_clis: ["hermes", "opencode"],
      price: { in: 0.3, out: 1.2 },
      scores: { coding_index: 72, agentic_index: 68, intelligence_index: 66 },
    },
  },
};

test("propose auto-applies when score rises and cost does not", () => {
  const r = proposeRoleChanges({ roster: ROSTER, scoresFile: SCORES });
  const impl = r.applied.find((a) => a.role === "implementer");
  assert.ok(impl);
  assert.equal(impl.proposed.model, "deepseek-v4-pro");
  assert.equal(impl.proposed.cli, "hermes");
  assert.ok(impl.proposed.blended < impl.current.blended);
});

test("propose skips pin_head roles", () => {
  const r = proposeRoleChanges({ roster: ROSTER, scoresFile: SCORES });
  const scout = r.skipped.find((s) => s.role === "scout");
  assert.equal(scout.reason, "pin_head");
});

test("propose skips when cost would increase", () => {
  const scores = structuredClone(SCORES);
  scores.models["deepseek-v4-pro"].price = { in: 10, out: 40 };
  scores.models["deepseek-v4-pro"].scores.coding_index = 90;
  const r = proposeRoleChanges({ roster: ROSTER, scoresFile: scores });
  assert.ok(!r.applied.find((a) => a.role === "implementer"));
  const skip = r.skipped.find((s) => s.role === "implementer");
  assert.equal(skip.reason, "cost would increase");
});

test("propose skips when score delta below min_delta", () => {
  const scores = structuredClone(SCORES);
  scores.models["deepseek-v4-pro"].scores.coding_index = 66; // +1 < 2
  const r = proposeRoleChanges({ roster: ROSTER, scoresFile: scores });
  const skip = r.skipped.find((s) => s.role === "implementer");
  assert.match(skip.reason, /min_delta/);
});

test("applyProposals rewrites chain head and can add open-weight model", () => {
  const roster = {
    ...ROSTER,
    models: { "claude-sonnet-5": ROSTER.models["claude-sonnet-5"] },
    roles: { implementer: { chain: ["claude:claude-sonnet-5"] } },
  };
  const proposals = proposeRoleChanges({ roster: { ...roster, models: ROSTER.models }, scoresFile: SCORES });
  // force applied with model not yet in roster.models:
  const forced = {
    applied: [{
      role: "implementer",
      proposed: { cli: "hermes", model: "deepseek-v4-pro", score: 72, blended: 0.5 },
      entry: "hermes:deepseek-v4-pro",
    }],
    skipped: [],
  };
  const next = applyProposals({ roster, scoresFile: SCORES, proposals: forced });
  assert.equal(next.roles.implementer.chain[0], "hermes:deepseek-v4-pro");
  assert.ok(next.models["deepseek-v4-pro"].open_weight);
});

test("buildCandidates prefers hermes for open-weight", () => {
  const c = buildCandidates({ roster: ROSTER, scoresFile: SCORES, role: "implementer" });
  assert.equal(c[0].model, "deepseek-v4-pro");
  assert.equal(c[0].cli, "hermes");
});
