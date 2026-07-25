#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "./team-up-load.mjs";

const __mod = await importTeamUp("src/roster/pass-to.mjs");
export const {
  alnumKey,
  findRosterMatches,
  heuristicCliModel,
  resolvePassTo,
  slugifyModelId
} = __mod;
