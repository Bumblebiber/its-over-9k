#!/usr/bin/env node
// limit-watch.mjs — hook entry point for o9k-roster. Reads the usage cache
// (never calls provider APIs) and prints a warning/handoff instruction when
// a provider crosses roster.json limits. Scoped to the active host CLI so
// Claude sessions are not told to hand off Codex work (and vice versa).
// Contract: silent + exit 0 in every failure mode — a hook must never block
// or noise up the host.

import { loadJson, configPath, usagePath, checkThresholds } from "./roster.mjs";
import { detectLimitWatchCli } from "./limit-watch-host.mjs";

try {
  const roster = loadJson(configPath());
  if (roster) {
    let usage = null;
    try {
      usage = loadJson(usagePath());
    } catch {
      // corrupt usage cache — treat as no data
    }
    const cli = detectLimitWatchCli();
    const out = checkThresholds({ roster, usage, cli });
    if (out) console.log(out);
  }
} catch {
  // no config / corrupt config — feature not enabled, stay silent
}
