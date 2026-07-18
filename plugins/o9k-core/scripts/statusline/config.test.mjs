// config.test.mjs — tests for statusline config read/write.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig, loadConfig, saveConfig, configPath } from "./config.mjs";

test("loadConfig returns null when missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  assert.equal(loadConfig({ path: path.join(dir, "missing.json") }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("saveConfig + loadConfig round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const p = path.join(dir, "statusline.json");
  const cfg = defaultConfig({ elements: ["tim", "model"] });
  saveConfig(cfg, { path: p });
  const got = loadConfig({ path: p });
  assert.equal(got.enabled, true);
  assert.deepEqual(got.elements, ["tim", "model"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("configPath respects O9K_STATUSLINE", () => {
  const prev = process.env.O9K_STATUSLINE;
  process.env.O9K_STATUSLINE = "/tmp/x-statusline.json";
  assert.equal(configPath(), "/tmp/x-statusline.json");
  if (prev === undefined) delete process.env.O9K_STATUSLINE;
  else process.env.O9K_STATUSLINE = prev;
});
