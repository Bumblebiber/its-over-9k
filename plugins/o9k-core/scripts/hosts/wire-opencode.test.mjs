import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpencodePluginContent, wireOpencode } from "./wire-opencode.mjs";

const coreRoot = fileURLToPath(new URL("../..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");

function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-opencode-"));
}

test("buildOpencodePluginContent bakes absolute MARKETPLACE path", () => {
  const content = buildOpencodePluginContent(marketRoot);
  assert.match(content, new RegExp(`const MARKETPLACE = "${marketRoot.replace(/\\/g, "\\\\")}";`));
  assert.doesNotMatch(content, /__O9K_MARKETPLACE_ROOT__/);
  assert.match(content, /session\.created/);
  assert.match(content, /core\/session-start/);
  assert.match(content, /memory\/session-start/);
  assert.match(content, /core\/update-check/);
  assert.match(content, /run-o9k-hook\.sh/);
  assert.match(content, /experimental\.session\.compacting/);
});

test("wireOpencode writes generated o9k.ts plugin", () => {
  const home = makeTmpHome();
  const dest = path.join(home, ".config/opencode/plugins/o9k.ts");

  const r = wireOpencode({ home, marketplaceRoot: marketRoot });
  assert.equal(r.ok, true);
  assert.match(r.detail, /wrote .*o9k\.ts/);
  assert.match(r.detail, /preCompact: experimental\.session\.compacting/);

  assert.ok(fs.existsSync(dest));
  const body = fs.readFileSync(dest, "utf8");
  assert.match(body, new RegExp(`const MARKETPLACE = "${marketRoot.replace(/\\/g, "\\\\")}";`));
  assert.match(body, /spawnSync\("bash", \[RUN_HOOK/);
  assert.match(body, /console\.log\(out\)/);

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireOpencode is idempotent", () => {
  const home = makeTmpHome();
  const once = wireOpencode({ home, marketplaceRoot: marketRoot });
  const pluginAfterOnce = fs.readFileSync(path.join(home, ".config/opencode/plugins/o9k.ts"), "utf8");
  const twice = wireOpencode({ home, marketplaceRoot: marketRoot });
  const pluginAfterTwice = fs.readFileSync(path.join(home, ".config/opencode/plugins/o9k.ts"), "utf8");
  assert.equal(once.ok, true);
  assert.equal(twice.ok, true);
  assert.match(twice.detail, /unchanged/);
  assert.equal(pluginAfterTwice, pluginAfterOnce);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireOpencode dryRun does not write files", () => {
  const home = makeTmpHome();
  const dest = path.join(home, ".config/opencode/plugins/o9k.ts");

  const r = wireOpencode({ home, marketplaceRoot: marketRoot, dryRun: true });
  assert.equal(r.ok, true);
  assert.match(r.detail, /dry-run: no files written/);
  assert.equal(fs.existsSync(dest), false);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireOpencode fails when run-o9k-hook.sh is missing", () => {
  const home = makeTmpHome();
  const r = wireOpencode({ home, marketplaceRoot: "/tmp/nonexistent-o9k-marketplace" });
  assert.equal(r.ok, false);
  assert.match(r.detail, /missing run-o9k-hook\.sh/);
  fs.rmSync(home, { recursive: true, force: true });
});
