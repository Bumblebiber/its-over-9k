import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectHosts } from "./detect.mjs";

test("detectHosts does not mark present from home dir alone (no bin)", () => {
  // Regression: a leftover/home-only config dir with no bin on PATH used to
  // count as "present" (bin || homeOk), causing false positives (e.g. an
  // uninstalled tool whose config dir survives). present now requires both.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-hosts-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  const hosts = detectHosts({ home: tmp, pathEnv: "" });
  assert.equal(hosts.codex.present, false);
  assert.equal(hosts.codex.home, true);
  assert.equal(hosts.claude.present, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("detectHosts marks present only when bin AND home dir both exist", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-hosts-"));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-bin-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  fs.writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
  const hosts = detectHosts({ home: tmp, pathEnv: binDir });
  assert.equal(hosts.codex.present, true);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(binDir, { recursive: true, force: true });
});

test("detectHosts resolves skillDir and hooksPath under home", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-hosts-"));
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  const hosts = detectHosts({ home: tmp, pathEnv: "" });
  assert.equal(hosts.cursor.skillDir, null); // Cursor: no writable skills dir in registry
  assert.ok(hosts.cursor.hooksPath.endsWith(path.join(".cursor", "hooks.json")));
  fs.rmSync(tmp, { recursive: true, force: true });
});
