#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { pathToFileURL } from "node:url";
import { importTeamUp } from "./team-up-load.mjs";
import { runTeamUpCli } from "./team-up-adapter.mjs";

const __mod = await importTeamUp("src/roster/roster.mjs");
export const {
  buildCommand,
  checkThresholds,
  configPath,
  dispatchFreshnessMs,
  firstPositional,
  limits,
  loadJson,
  markLimited,
  parseChainEntry,
  parseTtl,
  pick,
  requireRoster,
  resolveEffort,
  resolveLimitWindows,
  resolvePickAfterRefresh,
  rosterWritePath,
  runRosterCli,
  spawnPinnedInTmux,
  tmuxArgs,
  usagePath,
  usageWritePath,
  validateRoster
} = __mod;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runTeamUpCli("roster", process.argv.slice(2));
  process.exit(code);
}
