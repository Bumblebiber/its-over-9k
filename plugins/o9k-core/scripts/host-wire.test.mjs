import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectHosts } from "./detect.mjs";
import { syncSkills } from "./skills-sync.mjs";
import { verifyHost, wireHosts } from "./host-wire.mjs";
import { wireCodex } from "./hosts/wire-codex.mjs";
import { wireOpencode } from "./hosts/wire-opencode.mjs";

const coreRoot = fileURLToPath(new URL("..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");
const script = fileURLToPath(new URL("./host-wire.mjs", import.meta.url));

function makeTmpHome(dirs = [".codex"]) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-host-wire-"));
  for (const d of dirs) fs.mkdirSync(path.join(tmp, d), { recursive: true });
  return tmp;
}

test("verifyHost reports no before wiring", () => {
  const home = makeTmpHome();
  const hosts = detectHosts({ home, pathEnv: "" });
  const v = verifyHost(hosts.codex, home);
  assert.equal(v.skills, "no");
  assert.equal(v.hooks, "no");
  assert.equal(v.mcp, "no");
  fs.rmSync(home, { recursive: true, force: true });
});

test("verifyHost reports hooks=yes after wireOpencode", () => {
  const home = makeTmpHome([".config/opencode"]);
  wireOpencode({ home, marketplaceRoot: marketRoot });
  const hosts = detectHosts({ home, pathEnv: "" });
  const v = verifyHost(hosts.opencode, home);
  assert.equal(v.hooks, "yes");
  fs.rmSync(home, { recursive: true, force: true });
});

test("verifyHost reports yes after syncSkills + wireCodex", () => {
  const home = makeTmpHome();
  syncSkills({ home, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  wireCodex({ home, marketplaceRoot: marketRoot });
  const hosts = detectHosts({ home, pathEnv: "" });
  const v = verifyHost(hosts.codex, home);
  assert.equal(v.skills, "yes");
  assert.equal(v.hooks, "yes");
  fs.rmSync(home, { recursive: true, force: true });
});

test("verifyHost mcp=yes when config mentions hmem", () => {
  const home = makeTmpHome();
  fs.writeFileSync(
    path.join(home, ".codex/config.toml"),
    '[mcp.servers.hmem]\ncommand = "hmem"\n',
  );
  const hosts = detectHosts({ home, pathEnv: "" });
  const v = verifyHost(hosts.codex, home);
  assert.equal(v.mcp, "yes");
  fs.rmSync(home, { recursive: true, force: true });
});

test("verifyHost claude-plugin uses pillar detect for hooks", () => {
  const home = makeTmpHome([".claude"]);
  const hosts = detectHosts({ home, pathEnv: "" });
  const vAbsent = verifyHost(hosts.claude, home, "");
  assert.equal(vAbsent.hooks, "no");

  const withPillars = verifyHost(hosts.claude, home, coreRoot);
  assert.equal(withPillars.hooks, "yes");
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHosts wires codex and cursor with --only filter", () => {
  const home = makeTmpHome([".codex", ".cursor"]);
  const r = wireHosts({
    home,
    marketplaceRoot: marketRoot,
    only: ["codex", "cursor"],
  });
  assert.equal(r.results.length, 2);
  assert.ok(r.results.every((x) => x.ok));
  assert.ok(fs.existsSync(path.join(home, ".codex/hooks.json")));
  assert.ok(fs.existsSync(path.join(home, ".cursor/hooks.json")));
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHosts skips claude hook merge", () => {
  const home = makeTmpHome([".claude"]);
  const r = wireHosts({ home, marketplaceRoot: marketRoot, only: ["claude"] });
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].id, "claude");
  assert.equal(r.results[0].ok, true);
  assert.match(r.results[0].detail, /skipped/i);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHosts isolates per-host failures", () => {
  const home = makeTmpHome([".codex", ".cursor"]);
  const r = wireHosts({
    home,
    marketplaceRoot: "/nonexistent/o9k-marketplace",
    only: ["codex", "cursor"],
  });
  assert.equal(r.results.length, 2);
  assert.ok(r.results.every((x) => x.ok === false));
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHosts dryRun does not write hooks", () => {
  const home = makeTmpHome();
  const r = wireHosts({ home, marketplaceRoot: marketRoot, dryRun: true, only: ["codex"] });
  assert.equal(r.results[0].ok, true);
  assert.equal(fs.existsSync(path.join(home, ".codex/hooks.json")), false);
  fs.rmSync(home, { recursive: true, force: true });
});

test("host-wire.mjs CLI --dry-run exits 0", () => {
  const tmp = makeTmpHome();
  const r = spawnSync(process.execPath, [script, "--dry-run"], {
    env: { ...process.env, HOME: tmp },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /"results"/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
