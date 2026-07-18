import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { refreshHosts } from "./refresh-hosts.mjs";

const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
const marketRoot = path.join(pluginRoot, "..");
const script = fileURLToPath(new URL("./refresh-hosts.mjs", import.meta.url));

// Hermetic host detection: fake bin dir + pathEnv makes codex "present"
// regardless of what is installed on the machine running the tests.
function makeTmpHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-refresh-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, "codex"), "", { mode: 0o755 });
  return { tmp, pathEnv: binDir };
}

test("refreshHosts dry-run does not write host hooks under HOME", () => {
  const { tmp, pathEnv } = makeTmpHome();
  const out = refreshHosts({
    home: tmp,
    dryRun: true,
    pluginRoot,
    marketplaceRoot: marketRoot,
    only: ["codex"],
    pathEnv,
  });
  assert.equal(fs.existsSync(path.join(tmp, ".codex", "hooks.json")), false);
  assert.ok(out.hooks.results.some((r) => r.id === "codex" && r.ok));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("refreshHosts run wires codex and refreshes skills under HOME", () => {
  const { tmp, pathEnv } = makeTmpHome();
  const out = refreshHosts({
    home: tmp,
    dryRun: false,
    pluginRoot,
    marketplaceRoot: marketRoot,
    only: ["codex"],
    pathEnv,
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

// FIX6 regression: neither flag used to default to a live --run (unsafe).
// The CLI now requires exactly one of --dry-run/--run, mirroring host-wire.mjs.
test("refresh-hosts.mjs CLI requires exactly one of --dry-run/--run", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-refresh-cli-"));
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, HOME: tmp },
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: refresh-hosts\.mjs/);
  assert.equal(fs.existsSync(path.join(tmp, ".codex")), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("refresh-hosts.mjs CLI rejects both --dry-run and --run together", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-refresh-cli-"));
  const r = spawnSync(process.execPath, [script, "--dry-run", "--run"], {
    env: { ...process.env, HOME: tmp },
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: refresh-hosts\.mjs/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("refresh-hosts.mjs CLI --dry-run exits cleanly and writes nothing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-refresh-cli-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  const r = spawnSync(process.execPath, [script, "--dry-run", "--only=codex"], {
    env: { ...process.env, HOME: tmp },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(tmp, ".codex", "hooks.json")), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});
