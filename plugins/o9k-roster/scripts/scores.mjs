#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "./team-up-load.mjs";

const __mod = await importTeamUp("src/scores/scores.mjs");
export const {
  buildRoleScores,
  collectScores,
  defaultFixtureDir,
  loadScores,
  mergeCollected,
  scoresPath,
  writeScores
} = __mod;
