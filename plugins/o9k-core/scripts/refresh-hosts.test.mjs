import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshHosts } from "./refresh-hosts.mjs";

const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
const marketRoot = path.join(pluginRoot, "..");

test("refreshHosts dry-run does not write host hooks under HOME", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-refresh-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  const out = refreshHosts({
    home: tmp,
    dryRun: true,
    pluginRoot,
    marketplaceRoot: marketRoot,
    only: ["codex"],
  });
  assert.equal(fs.existsSync(path.join(tmp, ".codex", "hooks.json")), false);
  assert.ok(out.hooks.results.some((r) => r.id === "codex" && r.ok));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("refreshHosts run wires codex and refreshes skills under HOME", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-refresh-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  // Isolate PATH so present=home only
  const out = refreshHosts({
    home: tmp,
    dryRun: false,
    pluginRoot,
    marketplaceRoot: marketRoot,
    only: ["codex"],
  });
  assert.ok(fs.existsSync(path.join(tmp, ".agents", "skills", "o9k", "scout", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(tmp, ".codex", "hooks.json")));
  const hooks = JSON.parse(fs.readFileSync(path.join(tmp, ".codex", "hooks.json"), "utf8"));
  const blob = JSON.stringify(hooks);
  assert.match(blob, /o9k-core-session/);
  assert.equal(out.skills.errors.length, 0);
  assert.ok(out.hooks.results.every((r) => r.ok));
  fs.rmSync(tmp, { recursive: true, force: true });
});
