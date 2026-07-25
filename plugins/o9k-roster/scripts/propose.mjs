#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "./team-up-load.mjs";

const __mod = await importTeamUp("src/scores/propose.mjs");
export const {
  ROLE_SCORE_FIELDS,
  applyProposals,
  blendedPrice,
  buildCandidates,
  proposeRoleChanges,
  scoreForRole
} = __mod;
