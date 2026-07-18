// debug.mjs — O9K_DEBUG=1 makes swallowed hook errors visible.
// Kept per-plugin — pillars deliberately don't import each other.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function debugLog(scope, err) {
  if (process.env.O9K_DEBUG !== "1") return;
  try {
    const line = `${new Date().toISOString()} [${scope}] ${err?.stack || err}\n`;
    process.stderr.write(line);
    const dir = path.join(os.homedir(), ".o9k", "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "hook-errors.log"), line);
  } catch {
    /* debug logging must never throw */
  }
}
