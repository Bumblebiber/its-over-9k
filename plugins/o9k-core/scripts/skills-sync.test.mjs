import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "./skills-sync.mjs";

const coreRoot = fileURLToPath(new URL("..", import.meta.url)); // plugins/o9k-core
const marketRoot = path.join(coreRoot, "..");

test("syncSkills writes canonical and symlinks into codex skills dir", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  const r = syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k/scout/SKILL.md")));
  const link = path.join(tmp, ".codex/skills/scout");
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  // idempotent
  const r2 = syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.equal(r2.errors.length, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("syncSkills writes Cursor rules when skillDir is null", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.ok(fs.existsSync(path.join(tmp, ".cursor/rules/o9k-using-o9k.mdc")));
  fs.rmSync(tmp, { recursive: true, force: true });
});
