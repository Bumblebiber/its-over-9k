import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wireCursor } from "./wire-cursor.mjs";

const coreRoot = fileURLToPath(new URL("../..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");

function makeTmpHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-cursor-"));
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  return tmp;
}

test("wireCursor merges o9k hooks and preserves foreign hooks", () => {
  const home = makeTmpHome();
  const hooksJson = path.join(home, ".cursor/hooks.json");
  fs.writeFileSync(
    hooksJson,
    JSON.stringify(
      {
        version: 1,
        hooks: {
          sessionStart: [{ command: "bash /tmp/foreign-cursor.sh", timeout: 5 }],
        },
      },
      null,
      2,
    ),
  );

  const r = wireCursor({ home, marketplaceRoot: marketRoot });
  assert.equal(r.ok, true);

  const merged = JSON.parse(fs.readFileSync(hooksJson, "utf8"));
  assert.equal(merged.version, 1);
  const cmds = merged.hooks.sessionStart.map((h) => h.command);
  assert.ok(cmds.some((c) => c.includes("o9k-core-session")));
  assert.ok(cmds.some((c) => c.includes("foreign-cursor.sh")));
  assert.ok(cmds.some((c) => c.includes("o9k-memory-session")));
  assert.ok(cmds.some((c) => c.includes("o9k-update-check")));

  const pre = merged.hooks.preCompact?.map((h) => h.command) ?? [];
  assert.ok(pre.some((c) => c.includes("o9k-memory-precompact")));

  const wrapper = path.join(home, ".cursor/hooks/o9k-core-session.sh");
  assert.ok(fs.existsSync(wrapper));
  const body = fs.readFileSync(wrapper, "utf8");
  assert.match(body, /O9K_MARKETPLACE_ROOT=".*\/plugins"/);
  assert.match(body, /core\/session-start/);

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireCursor is idempotent", () => {
  const home = makeTmpHome();
  const once = wireCursor({ home, marketplaceRoot: marketRoot });
  const hooksAfterOnce = fs.readFileSync(path.join(home, ".cursor/hooks.json"), "utf8");
  const twice = wireCursor({ home, marketplaceRoot: marketRoot });
  const hooksAfterTwice = fs.readFileSync(path.join(home, ".cursor/hooks.json"), "utf8");
  assert.equal(once.ok, true);
  assert.equal(twice.ok, true);
  assert.equal(hooksAfterTwice, hooksAfterOnce);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireCursor backs up hooks.json before rewriting a changed file (FIX4)", () => {
  const home = makeTmpHome();
  const hooksJson = path.join(home, ".cursor/hooks.json");
  const original = JSON.stringify({ version: 1, hooks: {} });
  fs.writeFileSync(hooksJson, original);

  wireCursor({ home, marketplaceRoot: marketRoot });

  const backupPath = `${hooksJson}.o9k-bak`;
  assert.ok(fs.existsSync(backupPath));
  assert.equal(fs.readFileSync(backupPath, "utf8"), original);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireCursor dryRun does not write files", () => {
  const home = makeTmpHome();
  const hooksJson = path.join(home, ".cursor/hooks.json");
  fs.writeFileSync(hooksJson, JSON.stringify({ version: 1, hooks: {} }));

  const r = wireCursor({ home, marketplaceRoot: marketRoot, dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(hooksJson, "utf8"), JSON.stringify({ version: 1, hooks: {} }));
  assert.equal(fs.existsSync(path.join(home, ".cursor/hooks/o9k-core-session.sh")), false);
  fs.rmSync(home, { recursive: true, force: true });
});
