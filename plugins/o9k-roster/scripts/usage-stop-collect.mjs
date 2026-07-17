#!/usr/bin/env node
// usage-stop-collect.mjs — Claude Stop hook: debounced claude usage refresh.
// Contract: silent + exit 0 always.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEBOUNCE_MS = 15 * 60_000;

function debouncePath() {
  return path.join(os.homedir(), ".o9k/.usage-collect-claude.debounce");
}

try {
  const debounce = debouncePath();
  const now = Date.now();
  try {
    const last = Number(fs.readFileSync(debounce, "utf8"));
    if (Number.isFinite(last) && now - last < DEBOUNCE_MS) process.exit(0);
  } catch {
    /* no debounce file */
  }
  fs.mkdirSync(path.dirname(debounce), { recursive: true });
  fs.writeFileSync(debounce, String(now));

  const { collectUsageForCli } = await import("./usage-collect.mjs");
  await collectUsageForCli({ cli: "claude" });
} catch {
  // hook must never block the host
}
