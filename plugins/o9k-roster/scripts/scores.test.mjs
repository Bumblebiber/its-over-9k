// scores.mjs merge + role_scores tests (fixture-driven).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectScores,
  buildRoleScores,
  writeScores,
  mergeCollected,
} from "./scores.mjs";
import { normalizeBenchmarks, loadFixture } from "./collectors/openrouter-benchmarks.mjs";
import { normalizeModels } from "./collectors/openrouter-models.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "collectors/fixtures");

test("collectScores from fixtures merges scores and open_weight", async () => {
  const scores = await collectScores({ fixtureDir: FIXTURES });
  assert.equal(scores.models["gpt-5.6-sol"].scores.coding_index, 80);
  assert.equal(scores.models["deepseek-v4-pro"].open_weight, true);
  assert.ok(scores.sources["openrouter-benchmarks"].citation);
});

test("buildRoleScores ranks implementer by coding_index", async () => {
  const scores = await collectScores({ fixtureDir: FIXTURES });
  const roster = {
    clis: {
      hermes: { cmd: ["hermes"] },
      opencode: { cmd: ["opencode"] },
      claude: { cmd: ["claude"] },
      codex: { cmd: ["codex"] },
    },
    models: {
      "gpt-5.6-sol": { cli: ["codex"] },
      "claude-sonnet-5": { cli: ["claude"] },
      "deepseek-v4-pro": { cli: ["hermes", "opencode"] },
    },
  };
  const role_scores = buildRoleScores(scores, roster);
  assert.equal(role_scores.implementer[0].model, "gpt-5.6-sol");
  assert.ok(role_scores.implementer.some((r) => r.model === "deepseek-v4-pro" && r.cli === "hermes"));
});

test("writeScores / mergeCollected round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-scores-"));
  const dest = path.join(dir, "roster-scores.json");
  const benchmarks = normalizeBenchmarks(loadFixture("benchmarks.json"));
  const modelsCatalog = normalizeModels(
    JSON.parse(fs.readFileSync(path.join(FIXTURES, "models.json"), "utf8"))
  );
  const merged = mergeCollected({ benchmarks, modelsCatalog });
  writeScores(merged, dest);
  const read = JSON.parse(fs.readFileSync(dest, "utf8"));
  assert.equal(read.models["deepseek-v4-pro"].scores.coding_index, 72);
  fs.rmSync(dir, { recursive: true, force: true });
});
