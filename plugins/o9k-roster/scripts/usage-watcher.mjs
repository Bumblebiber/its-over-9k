#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "./team-up-load.mjs";

const __mod = await importTeamUp("src/usage/usage-watcher.mjs");
export const {
  advanceSchedule,
  computeState,
  decideCollect,
  planCollect,
  tickOnce,
  watcherConfig
} = __mod;
