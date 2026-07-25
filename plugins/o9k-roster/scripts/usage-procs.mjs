#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "./team-up-load.mjs";

const __mod = await importTeamUp("src/usage/usage-procs.mjs");
export const {
  CLI_BINARIES,
  countAgentProcesses,
  isAgentProcessCmdline,
  isCollectorCmdline,
  parsePsTable,
  procHasEnvMarker,
  watcherStatePath
} = __mod;
