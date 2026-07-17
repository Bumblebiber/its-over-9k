import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  tryAcquirePtyLock,
  releasePtyLock,
  withPtyLock,
} from "./usage-pty-lock.mjs";

test("withPtyLock serializes concurrent acquire", async () => {
  const lock = path.join(os.tmpdir(), `o9k-pty-lock-test-${process.pid}`);
  try {
    fs.unlinkSync(lock);
  } catch {
    /* ignore */
  }
  const a = await withPtyLock(async () => {
    const inner = await withPtyLock(async () => "no", { lockPath: lock });
    assert.equal(inner.ok, false);
    return "held";
  }, { lockPath: lock });
  assert.equal(a.ok, true);
  assert.equal(a.value, "held");
  releasePtyLock(lock);
});

test("tryAcquirePtyLock allows re-acquire after release", () => {
  const lock = path.join(os.tmpdir(), `o9k-pty-lock-test2-${process.pid}`);
  try {
    fs.unlinkSync(lock);
  } catch {
    /* ignore */
  }
  assert.equal(tryAcquirePtyLock(lock), true);
  releasePtyLock(lock);
  assert.equal(tryAcquirePtyLock(lock), true);
  releasePtyLock(lock);
});
