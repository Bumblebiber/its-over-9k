#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "./team-up-load.mjs";

const __mod = await importTeamUp("src/usage/usage-collect.mjs");
export const {
  collectUsage,
  collectUsageForCli,
  isSubscriptionCli,
  mergeUsageWindows,
  subscriptionsFromRoster,
  writeUsageAtomic
} = __mod;
