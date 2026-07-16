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
  const link = path.join(tmp, ".codex/skills/o9k-scout");
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  // idempotent
  const r2 = syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.equal(r2.errors.length, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("syncSkills leaves foreign scout dir and creates o9k-scout symlink beside it", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  const skillsDir = path.join(tmp, ".codex/skills");
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  const foreignScout = path.join(skillsDir, "scout");
  fs.mkdirSync(foreignScout, { recursive: true });
  fs.writeFileSync(path.join(foreignScout, "SKILL.md"), "# foreign\n");

  const r = syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });

  assert.ok(fs.statSync(foreignScout).isDirectory());
  assert.equal(fs.readFileSync(path.join(foreignScout, "SKILL.md"), "utf8"), "# foreign\n");
  const link = path.join(skillsDir, "o9k-scout");
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.ok(r.errors.every((e) => !e.includes("foreign")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("syncSkills preserves foreign o9k-scout content and reports error", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  const skillsDir = path.join(tmp, ".codex/skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  const blocked = path.join(skillsDir, "o9k-scout");
  fs.mkdirSync(blocked, { recursive: true });
  fs.writeFileSync(path.join(blocked, "SKILL.md"), "# user skill\n");

  const r = syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });

  assert.ok(fs.statSync(blocked).isDirectory());
  assert.equal(fs.readFileSync(path.join(blocked, "SKILL.md"), "utf8"), "# user skill\n");
  assert.ok(r.errors.some((e) => e.includes("foreign content blocks symlink")));
  assert.ok(r.errors.some((e) => e.includes("o9k-scout")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("syncSkills writes Cursor rules when skillDir is null", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.ok(fs.existsSync(path.join(tmp, ".cursor/rules/o9k-using-o9k.mdc")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

// FIX8 regression: SKILL_SOURCES used to be a hand-maintained list that
// never included o9k-recon's skills. Discovery now walks the registry's
// pillar list + each pillar's skills/ dir, so new skills (and pillars) show
// up automatically.
test("syncSkills discovers o9k-recon skills dynamically (not hardcoded)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k/bundle-bench/SKILL.md")));
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k/companion-bundles/SKILL.md")));
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k/framework-scout/SKILL.md")));
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k/roster/SKILL.md")));
  assert.ok(fs.lstatSync(path.join(tmp, ".codex/skills/o9k-bundle-bench")).isSymbolicLink());
  fs.rmSync(tmp, { recursive: true, force: true });
});
