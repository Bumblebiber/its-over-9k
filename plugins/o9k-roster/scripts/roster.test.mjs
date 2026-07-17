// Tests for roster.mjs pure selection logic. Hermetic: fixtures inline,
// no ~/.o9k access.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pick, parseTtl, markLimited, checkThresholds, buildCommand, tmuxArgs,
  parseChainEntry, firstPositional, resolveLimitWindows, resolvePickAfterRefresh,
} from "./roster.mjs";
import { fileURLToPath } from "node:url";

const ROSTER = {
  clis: {
    claude: { cmd: ["claude", "--model", "{model}", "{prompt}"] },
    codex: { cmd: ["codex", "--model", "{model}", "{prompt}"] },
    cursor: { cmd: ["cursor-agent", "--model", "{model}", "{prompt}"] },
    opencode: { cmd: ["opencode", "--model", "{model}", "--prompt", "{prompt}"] },
    hermes: { cmd: ["hermes", "chat", "-q", "{prompt}", "--model", "{model}"] },
  },
  models: {
    "model-a": { provider: "anthropic", tier: "frontier", cli: ["claude"] },
    "model-b": { provider: "openai", tier: "high", cli: ["codex"] },
    "model-c": { provider: "deepseek", tier: "mid", cli: ["opencode", "hermes"] },
    "model-g": { provider: "xai", tier: "high", cli: ["cursor", "opencode", "hermes"] },
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

test("parseChainEntry accepts bare model, cli:model, and objects", () => {
  assert.deepEqual(parseChainEntry("model-a"), { model: "model-a", cli: null });
  assert.deepEqual(parseChainEntry("cursor:model-g"), { model: "model-g", cli: "cursor" });
  assert.deepEqual(parseChainEntry({ model: "model-c", cli: "hermes" }), { model: "model-c", cli: "hermes" });
  assert.deepEqual(parseChainEntry({ model: "model-a" }), { model: "model-a", cli: null });
  assert.throws(() => parseChainEntry(":nope"), /invalid chain entry/);
  assert.throws(() => parseChainEntry({}), /invalid chain entry/);
});

test("pick honors cli:model pins and object entries", () => {
  const roster = {
    ...ROSTER,
    roles: {
      implementer: {
        chain: ["cursor:model-g", "hermes:model-c", "model-a"],
      },
    },
  };
  const r = pick({ roster, usage: null, role: "implementer", now: NOW });
  assert.equal(r.model, "model-g");
  assert.equal(r.cli, "cursor");

  const r2 = pick({
    roster: {
      ...roster,
      roles: { implementer: { chain: [{ model: "model-c", cli: "hermes" }] } },
    },
    usage: null,
    role: "implementer",
    now: NOW,
  });
  assert.equal(r2.model, "model-c");
  assert.equal(r2.cli, "hermes");
});

test("pick skips cli:model when cli not listed on model or template missing", () => {
  const roster = {
    ...ROSTER,
    roles: { planner: { chain: ["codex:model-a", "claude:model-a"] } },
  };
  const r = pick({ roster, usage: null, role: "planner", now: NOW });
  assert.equal(r.model, "model-a");
  assert.equal(r.cli, "claude");
  assert.match(r.skipped[0].reason, /not listed/);

  const roster2 = {
    ...ROSTER,
    roles: { planner: { chain: ["missingcli:model-a", "model-a"] } },
  };
  const r2 = pick({ roster: roster2, usage: null, role: "planner", now: NOW });
  assert.equal(r2.model, "model-a");
  assert.match(r2.skipped[0].reason, /no cli template/);
});

test("pick skips when a CLI name is mark-limited", () => {
  const roster = {
    ...ROSTER,
    roles: { implementer: { chain: ["cursor:model-g", "hermes:model-c"] } },
  };
  const usage = { marked: { cursor: { until: "2026-07-16T13:00:00Z" } } };
  const r = pick({ roster, usage, role: "implementer", now: NOW });
  assert.equal(r.model, "model-c");
  assert.equal(r.cli, "hermes");
  assert.match(r.skipped[0].reason, /cli marked limited/);
});

test("pick skips when resolved CLI usage is at/over handoff threshold", () => {
  // Cursor Abo at 97%: composer (provider cursor) already skipped via provider
  // gate; grok via cursor-agent must also skip — same CLI quota.
  const roster = {
    ...ROSTER,
    roles: { implementer: { chain: ["cursor:model-g", "hermes:model-c"] } },
  };
  const usage = { providers: { cursor: { used: 0.97 } } };
  const r = pick({ roster, usage, role: "implementer", now: NOW });
  assert.equal(r.model, "model-c");
  assert.equal(r.cli, "hermes");
  assert.deepEqual(r.skipped, [{ model: "cursor:model-g", reason: "cli cursor at 97%" }]);
});

test("firstPositional skips flag values so mark-limited --ttl 5h anthropic works", () => {
  assert.equal(firstPositional(["--ttl", "5h", "anthropic"]), "anthropic");
  assert.equal(firstPositional(["anthropic", "--ttl", "5h"]), "anthropic");
  assert.equal(firstPositional(["--ttl", "5h", "--reason", "rate-limit", "anthropic"]), "anthropic");
  assert.equal(firstPositional(["--ttl", "5h"]), undefined);
});

test("parseTtl parses m/h/d and rejects garbage", () => {
  assert.equal(parseTtl("30m"), 30 * 60_000);
  assert.equal(parseTtl("5h"), 5 * 3_600_000);
  assert.equal(parseTtl("1d"), 24 * 3_600_000);
  assert.throws(() => parseTtl("5x"), /invalid ttl/);
});

test("markLimited adds an until entry without mutating input", () => {
  const usage = { providers: { anthropic: { used: 0.5 } } };
  const out = markLimited({ usage, target: "model-a", ttlMs: 3_600_000, now: NOW, reason: "rate-limit" });
  assert.equal(out.marked["model-a"].until, new Date(NOW + 3_600_000).toISOString());
  assert.equal(out.marked["model-a"].reason, "rate-limit");
  assert.equal(usage.marked, undefined);
  // null usage bootstraps a fresh object:
  const fresh = markLimited({ usage: null, target: "openai", ttlMs: 60_000, now: NOW });
  assert.ok(fresh.marked.openai.until);
});

test("checkThresholds is silent below warn_at", () => {
  const usage = { providers: { anthropic: { used: 0.5 } } };
  assert.equal(checkThresholds({ roster: ROSTER, usage, now: NOW }), "");
});

test("checkThresholds warns at warn_at and instructs handoff at handoff_at", () => {
  const warn = checkThresholds({
    roster: ROSTER,
    usage: { providers: { anthropic: { used: 0.91 } } },
    now: NOW,
  });
  assert.match(warn, /anthropic at 91%/);
  assert.match(warn, /prepare for handoff/i);
  assert.doesNotMatch(warn, /HANDOFF\.md/);

  const handoff = checkThresholds({
    roster: ROSTER,
    usage: { providers: { anthropic: { used: 0.96 } } },
    now: NOW,
  });
  assert.match(handoff, /HANDOFF\.md/);
  assert.match(handoff, /roster.*handoff/i);
  const rosterScript = fileURLToPath(new URL("./roster.mjs", import.meta.url));
  assert.match(handoff, new RegExp(`node ${rosterScript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} handoff`));
  assert.doesNotMatch(handoff, /<o9k>/);
});

test("buildCommand substitutes model and prompt per argv element", () => {
  const argv = buildCommand({ roster: ROSTER, model: "model-a", cli: "claude", prompt: "do the thing" });
  assert.deepEqual(argv, ["claude", "--model", "model-a", "do the thing"]);
});

test("buildCommand throws when cli template is missing", () => {
  assert.throws(
    () => buildCommand({ roster: ROSTER, model: "model-b", cli: "nosuch", prompt: "x" }),
    /no cli template/
  );
});

test("tmuxArgs builds a detached session with cwd and shell-quoted command", () => {
  const args = tmuxArgs({
    session: "o9k-implementer-abc",
    dir: "/tmp/task",
    argv: ["claude", "--model", "m", "it's a prompt"],
  });
  assert.deepEqual(args.slice(0, 7), [
    "new-session", "-d", "-s", "o9k-implementer-abc", "-c", "/tmp/task",
    `claude --model m 'it'\\''s a prompt'`,
  ]);
});

test("pick skips fable model when fable-week hot but opus remains", () => {
  const roster = {
    ...ROSTER,
    models: {
      ...ROSTER.models,
      "claude-fable": { provider: "anthropic", cli: ["claude"] },
      "claude-opus": { provider: "anthropic", cli: ["claude"] },
    },
    roles: { reviewer: { chain: ["claude-fable", "claude-opus"] } },
  };
  const usage = {
    windows: {
      "claude:session": { used: 0.1 },
      "claude:week": { used: 0.5 },
      "claude:5h": { used: 0.1 },
      "claude:fable-week": { used: 0.97 },
    },
  };
  const r = pick({ roster, usage, role: "reviewer", now: NOW });
  assert.equal(r.model, "claude-opus");
  assert.match(r.skipped[0].reason, /fable-week/);
});

test("pick skips all claude models when 5h window hot", () => {
  const roster = {
    ...ROSTER,
    models: {
      "claude-opus": { provider: "anthropic", cli: ["claude"] },
      "model-c": { provider: "deepseek", cli: ["hermes"] },
    },
    roles: { planner: { chain: ["claude-opus", "model-c"] } },
  };
  const usage = {
    windows: {
      "claude:session": { used: 0.1 },
      "claude:week": { used: 0.2 },
      "claude:5h": { used: 0.96 },
    },
  };
  const r = pick({ roster, usage, role: "planner", now: NOW });
  assert.equal(r.model, "model-c");
  assert.match(r.skipped[0].reason, /claude:5h/);
});

test("resolveLimitWindows adds fable-week only for fable models", () => {
  assert.ok(resolveLimitWindows({}, "claude-fable-5", { cli: ["claude"] }).includes("claude:fable-week"));
  assert.ok(!resolveLimitWindows({}, "claude-opus", { cli: ["claude"] }).includes("claude:fable-week"));
});

test("checkThresholds warns on hot usage windows", () => {
  const warn = checkThresholds({
    roster: ROSTER,
    usage: { windows: { "claude:5h": { used: 0.92 } } },
    now: NOW,
  });
  assert.match(warn, /claude:5h at 92%/);
});

test("pick uses provider fallback when only other-cli windows exist", () => {
  const roster = {
    ...ROSTER,
    roles: { planner: { chain: ["model-b", "model-c"] } },
  };
  const usage = {
    windows: { "claude:5h": { used: 0.1 } },
    providers: { openai: { used: 0.99 } },
  };
  const r = pick({ roster, usage, role: "planner", now: NOW });
  assert.equal(r.model, "model-c");
  assert.match(r.skipped[0].reason, /provider openai/);
});

test("pick allows codex when weekly window expired at resets_at", () => {
  const roster = {
    ...ROSTER,
    roles: { planner: { chain: ["model-b"] } },
  };
  const usage = {
    windows: {
      "codex:weekly": { used: 1.0, resets_at: "2026-07-16T10:00:00Z" },
    },
  };
  const r = pick({ roster, usage, role: "planner", now: NOW });
  assert.equal(r.model, "model-b");
});

test("checkThresholds ignores expired windows at resets_at", () => {
  const out = checkThresholds({
    roster: ROSTER,
    usage: {
      windows: {
        "codex:weekly": { used: 1.0, resets_at: "2026-07-16T10:00:00Z" },
      },
    },
    now: NOW,
  });
  assert.equal(out, "");
});

test("resolvePickAfterRefresh re-picks with fresh usage", () => {
  const roster = {
    ...ROSTER,
    models: {
      "model-a": { provider: "anthropic", cli: ["claude"] },
      "model-b": { provider: "openai", cli: ["codex"] },
    },
    roles: { planner: { chain: ["model-a", "model-b"] } },
  };
  const preUsage = {
    windows: {
      "claude:5h": { used: 0.5 },
      "codex:weekly": { used: 0.5 },
    },
  };
  const postUsage = {
    windows: {
      "claude:5h": { used: 0.99 },
      "codex:weekly": { used: 0.5 },
    },
  };
  const priorPick = pick({ roster, usage: preUsage, role: "planner", now: NOW });
  const resolved = resolvePickAfterRefresh({
    roster,
    preUsage,
    postUsage,
    priorPick,
    role: "planner",
    now: NOW,
  });
  assert.equal(resolved.model, "model-b");
});

test("resolvePickAfterRefresh pins when collect probe alone blocks prior pick", () => {
  const roster = {
    ...ROSTER,
    models: { "model-a": { provider: "anthropic", cli: ["claude"] } },
    roles: { planner: { chain: ["model-a"] } },
  };
  const preUsage = { windows: { "claude:5h": { used: 0.94 } } };
  const postUsage = { windows: { "claude:5h": { used: 0.97 } } };
  const priorPick = pick({ roster, usage: preUsage, role: "planner", now: NOW });
  const resolved = resolvePickAfterRefresh({
    roster,
    preUsage,
    postUsage,
    priorPick,
    role: "planner",
    now: NOW,
  });
  assert.equal(resolved.model, "model-a");
});
