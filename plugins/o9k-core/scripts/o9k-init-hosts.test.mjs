import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./o9k-init.mjs", import.meta.url));

test("o9k-init.mjs prints Hosts section", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-init-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, HOME: tmp, CLAUDE_PLUGIN_ROOT: "" },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Hosts:/);
  assert.match(r.stdout, /Codex\s+present/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
