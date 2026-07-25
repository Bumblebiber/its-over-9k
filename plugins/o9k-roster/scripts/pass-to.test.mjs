// pass-to.test.mjs — resolvePassTo / heuristic / roster match
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePassTo,
  findRosterMatches,
  heuristicCliModel,
  alnumKey,
  slugifyModelId,
} from "./pass-to.mjs";

const ROSTER = {
  clis: {
    claude: { cmd: ["claude", "--model", "{model}", "{prompt}"] },
    cursor: { cmd: ["cursor-agent", "--model", "{model}", "{prompt}"] },
    codex: { cmd: ["codex", "--model", "{model}", "{prompt}"] },
    hermes: { cmd: ["hermes", "chat", "-q", "{prompt}", "--model", "{model}"] },
  },
  models: {
    "claude-opus": {
      provider: "anthropic",
      cli: ["claude"],
      cli_model: "opus",
    },
    "claude-sonnet-5": {
      provider: "anthropic",
      cli: ["claude"],
      cli_model: "sonnet",
    },
    "composer-2.5": {
      provider: "cursor",
      cli: ["cursor"],
    },
    "gpt-5.6-sol": {
      provider: "openai",
      cli: ["codex"],
    },
  },
};

test("display name GPT 5.6 Sol resolves to roster slug", () => {
  const r = resolvePassTo("GPT 5.6 Sol", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "gpt-5.6-sol");
  assert.equal(r.cli, "codex");
  assert.equal(r.source, "exact");
});

test("hyphenated display GPT-5.6 Sol resolves", () => {
  const r = resolvePassTo("GPT-5.6 Sol", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "gpt-5.6-sol");
});

test("codex pin with display name resolves", () => {
  const r = resolvePassTo("codex:GPT 5.6 Sol", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "gpt-5.6-sol");
  assert.equal(r.source, "exact-pin");
});

test("heuristic slugifies GPT display names for Codex", () => {
  assert.deepEqual(heuristicCliModel("GPT 5.6 Sol"), {
    cli: "codex",
    model: "gpt-5.6-sol",
  });
  assert.deepEqual(heuristicCliModel("gpt 5.4 mini"), {
    cli: "codex",
    model: "gpt-5.4-mini",
  });
});

test("alnumKey and slugifyModelId helpers", () => {
  assert.equal(alnumKey("GPT 5.6 Sol"), alnumKey("gpt-5.6-sol"));
  assert.equal(slugifyModelId("GPT 5.6 Sol"), "gpt-5.6-sol");
});

test("exact model key resolves", () => {
  const r = resolvePassTo("claude-opus", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "claude-opus");
  assert.equal(r.cli, "claude");
  assert.equal(r.source, "exact");
});

test("exact cli_model alias resolves", () => {
  const r = resolvePassTo("opus", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "claude-opus");
  assert.equal(r.source, "exact");
});

test("exact cli:model pin resolves", () => {
  const r = resolvePassTo("claude:claude-opus", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "claude-opus");
  assert.equal(r.cli, "claude");
  assert.equal(r.source, "exact-pin");
});

test("exact cli_model sonnet resolves", () => {
  const r = resolvePassTo("sonnet", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "claude-sonnet-5");
  assert.equal(r.source, "exact");
});

test("fuzzy substring unique resolves", () => {
  const r = resolvePassTo("sonnet-5", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.model, "claude-sonnet-5");
  assert.equal(r.source, "fuzzy");
});

test("ambiguous fuzzy asks human", () => {
  const roster = {
    ...ROSTER,
    models: {
      ...ROSTER.models,
      "claude-opus-extra": { provider: "anthropic", cli: ["claude"] },
    },
  };
  // "claude" fuzzy-matches claude-opus, claude-sonnet-5, claude-opus-extra
  const r = resolvePassTo("claude", roster);
  assert.equal(r.status, "ambiguous");
  assert.ok(r.matches.length >= 2);
});

test("no roster match falls back to heuristic", () => {
  const r = resolvePassTo("composer-3-nightly", ROSTER);
  assert.equal(r.status, "ok");
  assert.equal(r.cli, "cursor");
  assert.equal(r.model, "composer-3-nightly");
  assert.equal(r.source, "heuristic");
});

test("heuristicCliModel maps common families", () => {
  assert.deepEqual(heuristicCliModel("opus"), { cli: "claude", model: "opus" });
  assert.deepEqual(heuristicCliModel("gpt-5.4-mini"), {
    cli: "codex",
    model: "gpt-5.4-mini",
  });
  assert.deepEqual(heuristicCliModel("deepseek-v4-pro"), {
    cli: "hermes",
    model: "deepseek-v4-pro",
  });
  assert.equal(heuristicCliModel("weird-unknown-xyz"), null);
});

test("unresolved when no match and no heuristic", () => {
  const r = resolvePassTo("weird-unknown-xyz", ROSTER);
  assert.equal(r.status, "unresolved");
});

test("findRosterMatches empty query", () => {
  assert.deepEqual(findRosterMatches("", ROSTER), []);
});
