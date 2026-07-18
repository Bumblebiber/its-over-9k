import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wireClaudeStatusline } from "./wire-claude.mjs";
import { wireCursorStatusline } from "./wire-cursor.mjs";

const marketplaceRoot = path.join(fileURLToPath(new URL("../../..", import.meta.url)));

test("wireClaude replace writes statusLine and backup", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wcl-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const settings = path.join(home, ".claude/settings.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({ statusLine: { type: "command", command: "echo old" } }),
  );
  const r = wireClaudeStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(`${settings}.o9k-bak`));
  const j = JSON.parse(fs.readFileSync(settings, "utf8"));
  assert.match(j.statusLine.command, /o9k-statusline/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireClaude keep leaves foreign command", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wcl-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const settings = path.join(home, ".claude/settings.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({ statusLine: { type: "command", command: "echo old" } }),
  );
  const r = wireClaudeStatusline({ home, marketplaceRoot, mode: "keep" });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
  const j = JSON.parse(fs.readFileSync(settings, "utf8"));
  assert.equal(j.statusLine.command, "echo old");
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireCursor replace sets cli-config statusLine", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wcu-"));
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  const r = wireCursorStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, true);
  const j = JSON.parse(fs.readFileSync(path.join(home, ".cursor/cli-config.json"), "utf8"));
  assert.match(j.statusLine.command, /o9k-statusline/);
  fs.rmSync(home, { recursive: true, force: true });
});
