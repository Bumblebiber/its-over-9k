import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("./o9k-statusline.mjs", import.meta.url));

// The user pasting the command into their host config IS the opt-in (o9k no
// longer wires it — docs/STATUSLINE.md), so a missing config file must not
// produce a silently empty status bar.
test("falls back to default config when the config file is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const r = spawnSync(process.execPath, [entry, "--host", "claude"], {
    input: JSON.stringify({ model: { display_name: "Opus" }, render_width_chars: 200 }),
    encoding: "utf8",
    env: { ...process.env, O9K_STATUSLINE: path.join(dir, "nope.json") },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Opus/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("explicit enabled:false still silences the statusline", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const cfg = path.join(dir, "statusline.json");
  fs.writeFileSync(cfg, JSON.stringify({ version: 1, enabled: false }));
  const r = spawnSync(process.execPath, [entry, "--host", "claude"], {
    input: JSON.stringify({ model: { display_name: "Opus" } }),
    encoding: "utf8",
    env: { ...process.env, O9K_STATUSLINE: cfg },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("hermes format emits empty JSON when disabled", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const cfg = path.join(dir, "statusline.json");
  fs.writeFileSync(cfg, JSON.stringify({ version: 1, enabled: false }));
  const r = spawnSync(process.execPath, [entry, "--host", "hermes", "--format", "hermes"], {
    input: "{}",
    encoding: "utf8",
    env: { ...process.env, O9K_STATUSLINE: cfg },
  });
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), {});
  fs.rmSync(dir, { recursive: true, force: true });
});

test("renders model from stdin when enabled", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const cfg = path.join(dir, "statusline.json");
  fs.writeFileSync(
    cfg,
    JSON.stringify({
      version: 1,
      enabled: true,
      elements: ["model"],
      priority: ["model"],
      marquee: { enabled: false, keys: [] },
      hosts: {},
    }),
  );
  const r = spawnSync(process.execPath, [entry, "--host", "claude"], {
    input: JSON.stringify({
      model: { display_name: "Opus" },
      render_width_chars: 80,
    }),
    encoding: "utf8",
    env: { ...process.env, O9K_STATUSLINE: cfg },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "Opus");
  fs.rmSync(dir, { recursive: true, force: true });
});
