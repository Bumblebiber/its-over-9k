#!/usr/bin/env node
// Thin o9k adapter — spawn team-up usage-stop-collect (side-effectful hook).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTeamUpRoot } from "./team-up-adapter.mjs";

const root = resolveTeamUpRoot(process.env);
if (!root) process.exit(0);
const script = path.join(root, "src/usage/usage-stop-collect.mjs");
// Re-exec engine script; when engine re-spawns itself with --collect it uses its own path.
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    // Ensure detached child of engine still finds team-up home
    TEAM_UP_ROOT: process.env.TEAM_UP_ROOT || root,
  },
});
process.exit(r.status ?? 0);
