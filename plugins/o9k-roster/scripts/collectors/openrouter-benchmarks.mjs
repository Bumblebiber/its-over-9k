#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { importTeamUp } from "../team-up-load.mjs";

const __mod = await importTeamUp("src/collectors/openrouter-benchmarks.mjs");
export const {
  fetchBenchmarks,
  loadFixture,
  loadIdMap,
  mapId,
  normalizeBenchmarks,
  perMillion
} = __mod;
