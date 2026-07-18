import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "./skills-sync.mjs";
import { wireCodex } from "./hosts/wire-codex.mjs";
import { wireCursor } from "./hosts/wire-cursor.mjs";
import { wireOpencode } from "./hosts/wire-opencode.mjs";
import { wireHermes } from "./hosts/wire-hermes.mjs";
import { doctor } from "./o9k-doctor.mjs";
import { uninstall } from "./o9k-uninstall.mjs";

const coreRoot = fileURLToPath(new URL("..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");

// Full fake install: codex + cursor + opencode + hermes wired under a tmp home.
function makeWiredHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-doctor-"));
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  for (const b of ["codex", "cursor-agent"]) {
    fs.writeFileSync(path.join(binDir, b), "", { mode: 0o755 });
  }
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".config/opencode"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".hermes"), { recursive: true });
  syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot, pathEnv: binDir });
  wireCodex({ home: tmp, marketplaceRoot: marketRoot });
  wireCursor({ home: tmp, marketplaceRoot: marketRoot });
  wireOpencode({ home: tmp, marketplaceRoot: marketRoot });
  wireHermes({ home: tmp, marketplaceRoot: marketRoot });
  return { tmp, pathEnv: binDir };
}

test("doctor reports a healthy wired install", () => {
  const { tmp, pathEnv } = makeWiredHome();
  const r = doctor({ home: tmp, pathEnv });
  assert.ok(r.artifacts.some((a) => a.kind === "skill-link" && a.state === "ok"));
  assert.ok(r.artifacts.some((a) => a.kind === "hook-wrapper" && a.state === "ok"));
  assert.ok(r.artifacts.some((a) => a.kind === "opencode-plugin" && a.state === "ok"));
  assert.deepEqual(
    r.problems.filter((p) => !p.startsWith("skills out of sync")),
    []
  );
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor flags dangling symlinks and stale baked wrapper paths", () => {
  const { tmp, pathEnv } = makeWiredHome();
  // Dangle every skill link by deleting the canonical dir.
  fs.rmSync(path.join(tmp, ".agents/skills/o9k"), { recursive: true, force: true });
  // Stale wrapper: bake a marketplace path that doesn't exist.
  fs.writeFileSync(
    path.join(tmp, ".codex/hooks/o9k-stale-test.sh"),
    '#!/usr/bin/env bash\nexport O9K_MARKETPLACE_ROOT="/nonexistent/o9k-clone"\nexec bash "/nonexistent/o9k-clone/run.sh" x\n',
    { mode: 0o755 }
  );
  const r = doctor({ home: tmp, pathEnv });
  assert.ok(r.problems.some((p) => p.includes("dangling skill symlink")));
  assert.ok(r.problems.some((p) => p.includes("/nonexistent/o9k-clone")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("uninstall dry-run lists artifacts but writes nothing", () => {
  const { tmp, pathEnv } = makeWiredHome();
  const before = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  const r = uninstall({ home: tmp, dryRun: true, pathEnv });
  assert.ok(r.removed.length > 0);
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k")));
  assert.ok(fs.existsSync(path.join(tmp, ".config/opencode/plugins/o9k.ts")));
  const after = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  assert.deepEqual(after, before);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("uninstall removes o9k artifacts and strips hook configs, keeps foreign content", () => {
  const { tmp, pathEnv } = makeWiredHome();

  // Foreign content that must survive: a real dir named o9k-something, a
  // foreign hook entry in codex hooks.json, a foreign hermes hook line.
  const foreignSkill = path.join(tmp, ".codex/skills/o9k-my-own-skill");
  fs.mkdirSync(foreignSkill, { recursive: true });
  fs.writeFileSync(path.join(foreignSkill, "SKILL.md"), "# mine\n");
  const codexHooks = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  codexHooks.hooks.SessionStart[0].hooks.push({ type: "command", command: "echo foreign" });
  fs.writeFileSync(path.join(tmp, ".codex/hooks.json"), JSON.stringify(codexHooks, null, 2));

  const r = uninstall({ home: tmp, dryRun: false, pathEnv });
  assert.deepEqual(r.errors, []);

  // o9k artifacts gone
  assert.equal(fs.existsSync(path.join(tmp, ".agents/skills/o9k")), false);
  assert.equal(fs.existsSync(path.join(tmp, ".codex/skills/o9k-scout")), false);
  assert.equal(fs.existsSync(path.join(tmp, ".config/opencode/plugins/o9k.ts")), false);
  assert.equal(fs.existsSync(path.join(tmp, ".cursor/rules/o9k-using-o9k.mdc")), false);
  const codexWrappers = fs.existsSync(path.join(tmp, ".codex/hooks"))
    ? fs.readdirSync(path.join(tmp, ".codex/hooks")).filter((n) => n.startsWith("o9k-"))
    : [];
  assert.deepEqual(codexWrappers, []);

  // foreign content survives
  assert.ok(fs.statSync(foreignSkill).isDirectory());
  const strippedCodex = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  const blob = JSON.stringify(strippedCodex);
  assert.ok(blob.includes("echo foreign"));
  assert.ok(!blob.includes("o9k-core-session"));

  // hermes config stripped of o9k lines but file intact
  const hermesYaml = fs.readFileSync(path.join(tmp, ".hermes/config.yaml"), "utf8");
  assert.ok(!/o9k-/.test(hermesYaml));

  // doctor after uninstall: nothing of ours left ("foreign" = the user's own
  // o9k-my-own-skill dir, which uninstall correctly kept and doctor lists)
  const post = doctor({ home: tmp, pathEnv });
  assert.equal(
    post.artifacts.filter((a) => a.state !== "missing" && a.state !== "foreign").length,
    0
  );
  assert.deepEqual(post.problems.filter((p) => !p.startsWith("skills out of sync")), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});
