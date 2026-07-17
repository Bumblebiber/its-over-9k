import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HOOK_WRAPPERS,
  buildWrapperScript,
  installWrapper,
  limitWatchWrapperEnv,
  readJsonSafe,
  resolveRoots,
  writeFileWithBackup,
} from "./common.mjs";

test("readJsonSafe returns null on ENOENT and rethrows on malformed JSON", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-common-"));
  assert.equal(readJsonSafe(path.join(tmp, "missing.json")), null);

  const bad = path.join(tmp, "bad.json");
  fs.writeFileSync(bad, "{not json");
  assert.throws(() => readJsonSafe(bad));

  const good = path.join(tmp, "good.json");
  fs.writeFileSync(good, JSON.stringify({ a: 1 }));
  assert.deepEqual(readJsonSafe(good), { a: 1 });

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("resolveRoots derives marketplaceRoot from a wire-*.mjs module URL", () => {
  const { pluginRoot, marketplaceRoot } = resolveRoots(import.meta.url);
  assert.equal(pluginRoot.replace(/\/$/, "").split(path.sep).pop(), "o9k-core");
  assert.equal(marketplaceRoot, path.resolve(pluginRoot, ".."));
});

test("resolveRoots honors an explicit marketplaceRoot override", () => {
  const { marketplaceRoot } = resolveRoots(import.meta.url, "/tmp/custom-marketplace");
  assert.equal(marketplaceRoot, "/tmp/custom-marketplace");
});

test("writeFileWithBackup writes a single rolling .o9k-bak only when content differs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-common-"));
  const file = path.join(tmp, "config.json");
  const bak = `${file}.o9k-bak`;

  // First write: no prior file, no backup.
  assert.equal(writeFileWithBackup(file, "v1"), true);
  assert.equal(fs.existsSync(bak), false);

  // Same content again: no-op, no backup.
  assert.equal(writeFileWithBackup(file, "v1"), false);
  assert.equal(fs.existsSync(bak), false);

  // Different content: backs up the previous version, then writes new.
  assert.equal(writeFileWithBackup(file, "v2"), true);
  assert.equal(fs.readFileSync(bak, "utf8"), "v1");
  assert.equal(fs.readFileSync(file, "utf8"), "v2");

  // Rolling backup: a third change overwrites the backup, not appends.
  assert.equal(writeFileWithBackup(file, "v3"), true);
  assert.equal(fs.readFileSync(bak, "utf8"), "v2");

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("HOOK_WRAPPERS lists the shared wrapper names with timeouts", () => {
  const names = HOOK_WRAPPERS.map((w) => w.name);
  assert.deepEqual(names, [
    "o9k-core-session",
    "o9k-memory-session",
    "o9k-update-check",
    "o9k-memory-precompact",
    "o9k-roster-limit-watch",
  ]);
  assert.ok(HOOK_WRAPPERS.every((w) => typeof w.timeout === "number"));
});

test("buildWrapperScript adds a marker guard only when guardName is set", () => {
  const withGuard = buildWrapperScript({
    marketplaceRoot: "/mp",
    runHookPath: "/mp/run.sh",
    target: "core/session-start",
    guardName: "o9k-core-session",
  });
  assert.match(withGuard, /MARKER=/);
  assert.match(withGuard, /\[ -f "\$MARKER" \] && exit 0/);

  const noGuard = buildWrapperScript({
    marketplaceRoot: "/mp",
    runHookPath: "/mp/run.sh",
    target: "core/session-start",
  });
  assert.doesNotMatch(noGuard, /MARKER=/);
});

test("buildWrapperScript exports env vars before invoking the hook runner", () => {
  const script = buildWrapperScript({
    marketplaceRoot: "/mp",
    runHookPath: "/mp/run.sh",
    target: "roster/limit-watch",
    env: { O9K_LIMIT_WATCH_CLI: "codex" },
  });
  assert.match(script, /export O9K_LIMIT_WATCH_CLI="codex"/);
});

test("limitWatchWrapperEnv maps host ids to roster CLI slugs", () => {
  assert.deepEqual(limitWatchWrapperEnv("codex"), { O9K_LIMIT_WATCH_CLI: "codex" });
  assert.equal(limitWatchWrapperEnv("nosuch"), undefined);
});

test("installWrapper skips rewriting an unchanged wrapper, writes on change", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-common-"));
  const content = "#!/usr/bin/env bash\necho hi\n";
  assert.equal(installWrapper({ hooksDir: tmp, name: "x", content, dryRun: false }), true);
  assert.equal(installWrapper({ hooksDir: tmp, name: "x", content, dryRun: false }), false);
  assert.equal(
    installWrapper({ hooksDir: tmp, name: "x", content: content + "#", dryRun: false }),
    true,
  );
  fs.rmSync(tmp, { recursive: true, force: true });
});
