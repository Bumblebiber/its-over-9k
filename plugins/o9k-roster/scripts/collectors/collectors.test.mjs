// Collectors unit tests — fixtures only, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBenchmarks,
  loadFixture,
  loadIdMap,
  mapId,
  perMillion,
} from "./openrouter-benchmarks.mjs";
import { normalizeModels, isOpenWeight } from "./openrouter-models.mjs";

test("mapId uses id-map then slug fallback", () => {
  const map = loadIdMap();
  assert.equal(mapId("deepseek/deepseek-v4-pro", map), "deepseek-v4-pro");
  assert.equal(mapId("acme/new-model", map), "acme--new-model");
});

test("perMillion converts per-token tiny values", () => {
  assert.equal(perMillion("0.000005"), 5);
  assert.equal(perMillion("5"), 5);
});

test("normalizeBenchmarks reads AA indices from fixture", () => {
  const raw = loadFixture("benchmarks.json");
  const { models, source } = normalizeBenchmarks(raw);
  assert.equal(models["gpt-5.6-sol"].scores.coding_index, 80);
  assert.equal(models["deepseek-v4-pro"].scores.coding_index, 72);
  assert.ok(source.citation);
});

test("isOpenWeight detects HF id and known orgs", () => {
  assert.equal(isOpenWeight({ hugging_face_id: "x/y" }), true);
  assert.equal(isOpenWeight({ id: "meta-llama/llama-4-maverick" }), true);
  assert.equal(isOpenWeight({ id: "openai/gpt-5.6-sol" }), false);
});

test("normalizeModels flags open-weight and sets hosted_clis", () => {
  const raw = loadFixture("models.json");
  const { models } = normalizeModels(raw);
  assert.equal(models["deepseek-v4-pro"].open_weight, true);
  assert.deepEqual(models["deepseek-v4-pro"].hosted_clis, ["hermes", "opencode"]);
  assert.equal(models["gpt-5.6-sol"].open_weight, false);
  assert.equal(models["meta-llama--llama-4-maverick"].open_weight, true);
  assert.deepEqual(models["meta-llama--llama-4-maverick"].hosted_clis, ["hermes", "opencode"]);
});
