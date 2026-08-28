import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractVitestJson } from "./vitest-json.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(DIR, "../fixtures/extract/vitest-fail.json");

test("fixture is ≥30 KB", () => {
  const size = fs.statSync(FIXTURE).size;
  assert.ok(size >= 30_000, `fixture ${size} bytes`);
});

test("returns failed test count and names", () => {
  const text = fs.readFileSync(FIXTURE, "utf8");
  const { summary, stats } = extractVitestJson(text);
  assert.equal(stats.failed, 8);
  assert.equal(stats.passed, 60);
  for (let i = 0; i < 8; i++) {
    assert.match(summary, new RegExp(`fails when input ${i} is invalid`));
  }
});

test("stdout summary ≤ 2048 bytes for fixture", () => {
  const text = fs.readFileSync(FIXTURE, "utf8");
  const { summary } = extractVitestJson(text);
  assert.ok(
    Buffer.byteLength(summary, "utf8") <= 2048,
    `summary ${Buffer.byteLength(summary, "utf8")} bytes`,
  );
});

test("includes file:line for each failure", () => {
  const text = fs.readFileSync(FIXTURE, "utf8");
  const { summary } = extractVitestJson(text);
  assert.match(summary, /login\.test\.ts:\d+/);
  assert.match(summary, /invoice\.test\.ts:\d+/);
});

test("all-green summary ≤ 200 bytes", () => {
  const green = JSON.stringify({
    numFailedTests: 0,
    numPassedTests: 3,
    numTotalTests: 3,
    success: true,
    testResults: [
      {
        name: "/tmp/a.test.ts",
        status: "passed",
        assertionResults: [
          { title: "ok", status: "passed", fullName: "ok", failureMessages: [] },
        ],
      },
    ],
  });
  const { summary, stats } = extractVitestJson(green);
  assert.equal(stats.failed, 0);
  assert.match(summary, /0 failed/i);
  assert.ok(Buffer.byteLength(summary, "utf8") <= 200);
});
