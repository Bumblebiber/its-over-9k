#!/usr/bin/env node
// usage-stop-collect.mjs — Claude Stop hook: debounced claude usage refresh.
// Contract: silent + exit 0 always.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { debugLog } from "./debug.mjs";

const DEBOUNCE_MS = 15 * 60_000;

function debouncePath() {
  return path.join(os.homedir(), ".o9k/.usage-collect-claude.debounce");
}

try {
  // Never collect from inside a collector-spawned claude run (its Stop hook
  // fires too — the PTY lock would catch it, but don't even try).
  if (process.env.O9K_USAGE_COLLECT === "1") process.exit(0);

  const debounce = debouncePath();
  const now = Date.now();
  try {
    const last = Number(fs.readFileSync(debounce, "utf8"));
    if (Number.isFinite(last) && now - last < DEBOUNCE_MS) process.exit(0);
  } catch {
    /* no debounce file */
  }

  const { collectUsageForCli } = await import("./usage-collect.mjs");
  const r = await collectUsageForCli({ cli: "claude" });
  // Stamp only after a successful collect — a failed attempt (lock contention,
  // empty parse) must not suppress retries for the whole debounce window.
  if (r?.ok) {
    fs.mkdirSync(path.dirname(debounce), { recursive: true });
    fs.writeFileSync(debounce, String(now));
  }
} catch (e) {
  // hook must never block the host
  debugLog("o9k-roster usage-stop-collect", e);
}
