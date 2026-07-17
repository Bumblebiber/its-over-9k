// limit-watch.mjs contract: silent exit 0 without config; warning text on
// stdout when a provider crosses warn_at; never a non-zero exit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./limit-watch.mjs", import.meta.url));

function run(env) {
  return execFileSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("silent when no roster config exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-"));
  const out = run({ O9K_ROSTER: path.join(dir, "none.json"), O9K_USAGE: path.join(dir, "none2.json") });
  assert.equal(out, "");
});

test("prints warning when a provider crosses warn_at", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-"));
  const rosterPath = path.join(dir, "roster.json");
  const usagePath = path.join(dir, "usage.json");
  fs.writeFileSync(rosterPath, JSON.stringify({
    models: { m: { provider: "anthropic", cli: ["claude"] } },
    roles: {},
    limits: { warn_at: 0.9, handoff_at: 0.95 },
  }));
  fs.writeFileSync(usagePath, JSON.stringify({ providers: { anthropic: { used: 0.92 } } }));
  const out = run({ O9K_ROSTER: rosterPath, O9K_USAGE: usagePath, O9K_LIMIT_WATCH_CLI: "claude" });
  assert.match(out, /anthropic at 92%/);
});

test("ignores other-cli windows when scoped to claude", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-"));
  const rosterPath = path.join(dir, "roster.json");
  const usagePath = path.join(dir, "usage.json");
  fs.writeFileSync(rosterPath, JSON.stringify({
    models: {},
    roles: {},
    limits: { warn_at: 0.9, handoff_at: 0.95 },
  }));
  fs.writeFileSync(usagePath, JSON.stringify({
    windows: {
      "claude:session": { used: 0.92 },
      "codex:weekly": { used: 1.0, resets_at: "2026-12-01T00:00:00Z" },
    },
  }));
  const out = run({
    O9K_ROSTER: rosterPath,
    O9K_USAGE: usagePath,
    O9K_LIMIT_WATCH_CLI: "claude",
  });
  assert.match(out, /claude:session at 92%/);
  assert.doesNotMatch(out, /codex:weekly/);
  assert.doesNotMatch(out, /HANDOFF\.md/);
});

test("exit 0 even with corrupt usage.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-"));
  const rosterPath = path.join(dir, "roster.json");
  const usagePath = path.join(dir, "usage.json");
  fs.writeFileSync(rosterPath, JSON.stringify({ models: {}, roles: {} }));
  fs.writeFileSync(usagePath, "{not json");
  const out = run({ O9K_ROSTER: rosterPath, O9K_USAGE: usagePath });
  assert.equal(typeof out, "string"); // execFileSync throws on non-zero exit — reaching here IS the assertion
});
