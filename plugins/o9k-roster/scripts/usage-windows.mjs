#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "./team-up-load.mjs";

const __mod = await importTeamUp("src/usage/usage-windows.mjs");
export const {
  WINDOW_MAX_AGE_MS,
  effectiveResetAt,
  isCliUsageFresh,
  modelUsageGate,
  parseResetAt,
  resolveHandoffAt,
  windowIsBlocking,
  windowMaxAgeMs
} = __mod;
