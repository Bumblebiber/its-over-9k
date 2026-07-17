import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseClaudeUsage, claudeParseComplete } from "./collectors/parse-claude-usage.mjs";
import { parseCodexStatus } from "./collectors/parse-codex-status.mjs";
import { parseCursorUsage } from "./collectors/parse-cursor-usage.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/usage");

test("parseClaudeUsage reads session/week/fable/5h", () => {
  const text = fs.readFileSync(path.join(FIX, "claude-usage.txt"), "utf8");
  const w = parseClaudeUsage(text, { now: "2026-07-17T12:00:00Z" });
  assert.equal(w["claude:session"].used, 0.07);
  assert.equal(w["claude:week"].used, 0.4);
  assert.equal(w["claude:fable-week"].used, 0.57);
  assert.equal(w["claude:5h"].used, 0.12);
  assert.ok(claudeParseComplete(w));
});

test("parseCodexStatus derives used from percent left", () => {
  const text = fs.readFileSync(path.join(FIX, "codex-status.txt"), "utf8");
  const w = parseCodexStatus(text);
  assert.equal(w["codex:weekly"].used, 1);
  assert.match(w["codex:weekly"].resets_at, /23 Jul/);
});

test("parseCursorUsage reads included/auto/api", () => {
  const text = fs.readFileSync(path.join(FIX, "cursor-usage.txt"), "utf8");
  const w = parseCursorUsage(text);
  assert.equal(w["cursor:included"].used, 0.54);
  assert.equal(w["cursor:auto"].used, 0.52);
  assert.equal(w["cursor:api"].used, 0.69);
});
