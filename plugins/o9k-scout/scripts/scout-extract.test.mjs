import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(DIR, "scout-extract.mjs");
const FIXTURE = path.join(DIR, "fixtures/extract/vitest-fail.json");

function run(args, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, ...env },
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? Buffer.alloc(0),
    stderr: (r.stderr ?? Buffer.alloc(0)).toString("utf8"),
  };
}

test("--profile vitest on fixture → exit 0 + receipt", () => {
  const r = run(["--profile", "vitest", FIXTURE]);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /SCOUT_EXTRACT profile=vitest in=\d+ out=\d+/);
  assert.match(r.stdout.toString("utf8"), /failed/i);
});

test("out/in < 0.1 on fixture", () => {
  const r = run(["--profile", "vitest", FIXTURE]);
  assert.equal(r.status, 0);
  const m = r.stderr.match(/in=(\d+) out=(\d+)/);
  assert.ok(m);
  const inn = Number(m[1]);
  const out = Number(m[2]);
  assert.ok(inn >= 30_000);
  assert.ok(out / inn < 0.1, `ratio ${out}/${inn}`);
});

test("unknown profile → exit 2", () => {
  const r = run(["--profile", "nope", FIXTURE]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown profile/);
});

test("input > max bytes → truncate + WARN; receipt in= full size", () => {
  const full = fs.statSync(FIXTURE).size;
  const cap = 500;
  const r = run(["--profile", "vitest", "--max-bytes", String(cap), FIXTURE]);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARN: truncated in=\d+ cap=500/);
  assert.match(r.stderr, new RegExp(`in=${full}`));
  // truncated JSON → parse fail path still exit 0
  assert.match(r.stderr, /SCOUT_EXTRACT/);
});

test("O9K_SCOUT_EXTRACT=off → byte-identical stdout, WARN, exit 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scout-x-"));
  const small = path.join(dir, "small.json");
  const body = Buffer.from('{"numFailedTests":0,"numPassedTests":1,"testResults":[]}');
  fs.writeFileSync(small, body);
  const r = run(["--profile", "vitest", small], { O9K_SCOUT_EXTRACT: "off" });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.equals(body), "stdout must equal file bytes");
  assert.match(r.stderr, /WARN: SCOUT_EXTRACT disabled/);
  assert.doesNotMatch(r.stderr, /SCOUT_EXTRACT profile=/);
});
