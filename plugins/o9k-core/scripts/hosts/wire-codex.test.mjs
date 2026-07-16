import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wireCodex } from "./wire-codex.mjs";

const coreRoot = fileURLToPath(new URL("../..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");

function makeTmpHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-codex-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  return tmp;
}

test("wireCodex merges o9k hooks and preserves foreign hooks", () => {
  const home = makeTmpHome();
  const hooksJson = path.join(home, ".codex/hooks.json");
  fs.writeFileSync(
    hooksJson,
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              matcher: "startup|resume",
              hooks: [{ type: "command", command: "bash /tmp/foreign-codex.sh", timeout: 5 }],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  const r = wireCodex({ home, marketplaceRoot: marketRoot });
  assert.equal(r.ok, true);

  const merged = JSON.parse(fs.readFileSync(hooksJson, "utf8"));
  const cmds = merged.hooks.SessionStart[0].hooks.map((h) => h.command);
  assert.ok(cmds.some((c) => c.includes("o9k-core-session")));
  assert.ok(cmds.some((c) => c.includes("foreign-codex.sh")));
  assert.ok(cmds.some((c) => c.includes("o9k-memory-session")));
  assert.ok(cmds.some((c) => c.includes("o9k-update-check")));

  const pre = merged.hooks.PreCompact?.[0]?.hooks?.map((h) => h.command) ?? [];
  assert.ok(pre.some((c) => c.includes("o9k-memory-precompact")));

  const wrapper = path.join(home, ".codex/hooks/o9k-core-session.sh");
  assert.ok(fs.existsSync(wrapper));
  const body = fs.readFileSync(wrapper, "utf8");
  assert.match(body, /O9K_MARKETPLACE_ROOT=".*\/plugins"/);
  assert.match(body, /core\/session-start/);

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireCodex is idempotent", () => {
  const home = makeTmpHome();
  const once = wireCodex({ home, marketplaceRoot: marketRoot });
  const hooksAfterOnce = fs.readFileSync(path.join(home, ".codex/hooks.json"), "utf8");
  const twice = wireCodex({ home, marketplaceRoot: marketRoot });
  const hooksAfterTwice = fs.readFileSync(path.join(home, ".codex/hooks.json"), "utf8");
  assert.equal(once.ok, true);
  assert.equal(twice.ok, true);
  assert.equal(hooksAfterTwice, hooksAfterOnce);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireCodex dryRun does not write files", () => {
  const home = makeTmpHome();
  const hooksJson = path.join(home, ".codex/hooks.json");
  fs.writeFileSync(hooksJson, JSON.stringify({ hooks: {} }));

  const r = wireCodex({ home, marketplaceRoot: marketRoot, dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(hooksJson, "utf8"), JSON.stringify({ hooks: {} }));
  assert.equal(fs.existsSync(path.join(home, ".codex/hooks/o9k-core-session.sh")), false);
  fs.rmSync(home, { recursive: true, force: true });
});
