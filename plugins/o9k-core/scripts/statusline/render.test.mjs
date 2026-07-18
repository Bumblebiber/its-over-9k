import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderLine } from "./render.mjs";

test("joins segments with middle dot", () => {
  const line = renderLine({
    config: {
      enabled: true,
      elements: ["model", "context"],
      priority: ["model", "context"],
      marquee: { enabled: false, keys: [] },
    },
    segments: { model: "Opus", context: "ctx:40%" },
    width: 80,
  });
  assert.equal(line, "Opus · ctx:40%");
});

test("drops lowest keep-priority when over width", () => {
  const line = renderLine({
    config: {
      enabled: true,
      elements: ["model", "git"],
      priority: ["model", "git"],
      marquee: { enabled: false, keys: [] },
    },
    segments: { model: "Opus", git: "x".repeat(100) },
    width: 20,
  });
  assert.ok(line.length <= 20);
  assert.ok(line.includes("Opus"));
});

test("marquee advances offset for long key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mq-"));
  const statePath = path.join(dir, "mq.json");
  const cfg = {
    enabled: true,
    elements: ["git"],
    priority: ["git"],
    marquee: { enabled: true, keys: ["git"] },
  };
  const a = renderLine({
    config: cfg,
    segments: { git: "abcdefghij" },
    width: 5,
    marqueePath: statePath,
  });
  const b = renderLine({
    config: cfg,
    segments: { git: "abcdefghij" },
    width: 5,
    marqueePath: statePath,
  });
  assert.notEqual(a, b);
  assert.equal(a.length, 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("skips marquee keys in shrink without aborting priority trim", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mq-"));
  const statePath = path.join(dir, "mq.json");
  const segments = {
    limits: "lim:5h:42%",
    tim: "very-long-tim-project-name",
    context: "ctx:63%",
    model: "claude-opus-4-5-20260620",
    device: "dev",
    git: "feat/very-long-branch-name",
  };
  const line = renderLine({
    config: {
      enabled: true,
      elements: Object.keys(segments),
      priority: ["limits", "tim", "context", "model", "device", "git"],
      marquee: { enabled: true, keys: ["git", "tim"] },
    },
    segments,
    width: 50,
    marqueePath: statePath,
  });
  assert.ok(line.length <= 50, `line too long (${line.length}): ${line}`);
  assert.ok(line.includes("lim:"), `limits segment lost: ${line}`);
  assert.ok(!line.startsWith("…"), `whole-line ellipsize mangled start: ${line}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("marquee key survives shrink when other segments exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mq-"));
  const statePath = path.join(dir, "mq.json");
  const line = renderLine({
    config: {
      enabled: true,
      elements: ["model", "git"],
      priority: ["model", "git"],
      marquee: { enabled: true, keys: ["git"] },
    },
    segments: { model: "Opus", git: "abcdefghijklmnop" },
    width: 15,
    marqueePath: statePath,
  });
  assert.ok(line.includes("Opus"));
  assert.notEqual(line.trim(), "Opus");
  assert.ok(/[a-p]/.test(line));
  assert.ok(line.length <= 15);
  fs.rmSync(dir, { recursive: true, force: true });
});
