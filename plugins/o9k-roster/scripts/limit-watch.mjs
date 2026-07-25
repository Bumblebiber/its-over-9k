#!/usr/bin/env node
// Thin o9k adapter — spawn team-up limit-watch (do not import; it is side-effectful).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveTeamUpRoot, missingTeamUpMessage } from "./team-up-adapter.mjs";

const root = resolveTeamUpRoot(process.env);
if (!root) {
  // Hook contract: silent + exit 0 when team-up not configured
  process.exit(0);
}
const script = path.join(root, "src/roster/limit-watch.mjs");
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 0);
