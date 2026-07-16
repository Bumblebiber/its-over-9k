import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectHosts } from "./detect.mjs";

test("detectHosts marks present when home dir exists even without bin", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-hosts-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  const hosts = detectHosts({ home: tmp, pathEnv: "" });
  assert.equal(hosts.codex.present, true);
  assert.equal(hosts.codex.home, true);
  assert.equal(hosts.claude.present, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("detectHosts resolves skillDir and hooksPath under home", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-hosts-"));
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  const hosts = detectHosts({ home: tmp, pathEnv: "" });
  assert.equal(hosts.cursor.skillDir, null); // Cursor: no writable skills dir in registry
  assert.ok(hosts.cursor.hooksPath.endsWith(path.join(".cursor", "hooks.json")));
  fs.rmSync(tmp, { recursive: true, force: true });
});
