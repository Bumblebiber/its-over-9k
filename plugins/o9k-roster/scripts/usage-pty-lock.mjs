// usage-pty-lock.mjs — cross-process mutex for PTY collectors (zero npm deps).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isPidAlive } from "./runs.mjs";

export function ptyLockPath() {
  return process.env.O9K_PTY_LOCK || path.join(os.homedir(), ".o9k/.usage-pty.lock");
}

/** @returns {boolean} */
export function tryAcquirePtyLock(lockPath = ptyLockPath()) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    try {
      const holder = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
      if (!isPidAlive(holder)) {
        fs.unlinkSync(lockPath);
        fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch {
      // corrupt lock — best effort remove
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
    return false;
  }
}

export function releasePtyLock(lockPath = ptyLockPath()) {
  try {
    const holder = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
    if (holder === process.pid) fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

/**
 * @template T
 * @param {() => T | Promise<T>} fn
 * @param {{ lockPath?: string }} [opts]
 * @returns {Promise<{ ok: true, value: T } | { ok: false, reason: 'locked' }>}
 */
export async function withPtyLock(fn, opts = {}) {
  const lockPath = opts.lockPath || ptyLockPath();
  if (!tryAcquirePtyLock(lockPath)) {
    return { ok: false, reason: "locked" };
  }
  try {
    return { ok: true, value: await fn() };
  } finally {
    releasePtyLock(lockPath);
  }
}
