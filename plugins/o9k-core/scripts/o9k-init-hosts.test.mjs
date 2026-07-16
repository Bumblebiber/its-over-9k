import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "./skills-sync.mjs";
import { wireCodex } from "./hosts/wire-codex.mjs";

const script = fileURLToPath(new URL("./o9k-init.mjs", import.meta.url));
const coreRoot = fileURLToPath(new URL("..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");

test("o9k-init.mjs prints Hosts section with verify columns", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-init-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, HOME: tmp, CLAUDE_PLUGIN_ROOT: coreRoot },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Hosts:/);
  assert.match(r.stdout, /Codex\s+present\s+skills=no hooks=no mcp=no/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("o9k-init.mjs reports wired codex host snapshot", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-init-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  wireCodex({ home: tmp, marketplaceRoot: marketRoot });
  fs.writeFileSync(
    path.join(tmp, ".codex/config.toml"),
    '[mcp.servers.hmem]\ncommand = "hmem"\n',
  );
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, HOME: tmp, CLAUDE_PLUGIN_ROOT: coreRoot },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Codex\s+present\s+skills=yes hooks=yes mcp=yes/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
