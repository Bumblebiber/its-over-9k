#!/usr/bin/env node
// pre-compact.mjs — o9k-memory PreCompact hook.
//
// Compaction summaries are lossy; memory is not. Before Claude Code compacts,
// trigger the backend's checkpoint so decisions/lessons/open state from the
// dying context are persisted. Best-effort and non-blocking: compaction is
// never delayed or vetoed, and PreCompact cannot inject context anyway.

import { spawn } from "node:child_process";
import { detectBackend, readStdinJson } from "./backend.mjs";

const payload = readStdinJson();
const backend = detectBackend();

let cmd = null;
if (backend.kind === "tim" && payload.session_id) {
  cmd = ["tim", ["checkpoint", "--session", payload.session_id]];
  if (process.env.TIM_CLI) cmd = ["node", [process.env.TIM_CLI, "checkpoint", "--session", payload.session_id]];
} else if (backend.kind === "hmem") {
  cmd = ["hmem", ["checkpoint"]];
}

if (cmd) {
  // Fire and forget — detached so compaction proceeds immediately.
  spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore", shell: process.platform === "win32" }).unref();
}
process.exit(0);
