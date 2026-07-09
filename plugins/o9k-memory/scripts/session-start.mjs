#!/usr/bin/env node
// session-start.mjs — o9k-memory SessionStart hook.
//
// Emits a compact memory-loading directive (never the memory content itself —
// the agent pays for detail only when it drills down via MCP tools).
// Skips entirely when the backend's own hooks already own session start.

import { detectBackend, backendHooksAlreadyInstalled, readStdinJson } from "./backend.mjs";

const payload = readStdinJson();
const cwd = payload.cwd || process.cwd();
const backend = detectBackend();

if (backend.kind === "none") process.exit(0);
if (backendHooksAlreadyInstalled(backend.kind)) process.exit(0);

let directive = "";

if (backend.kind === "tim") {
  // TIM resolves the nearest .tim-project marker and prints a ready directive
  // instructing the agent to call tim_load_project(label=...).
  directive = backend.run(["resolve-project", "--cwd", cwd, "--format", "directive"]);
} else if (backend.kind === "hmem") {
  directive =
    "Memory backend: hmem (MCP). Before other work, invoke the hmem-session-start " +
    "skill (or call load_project for the project matching this workspace). " +
    "Load the briefing only — drill into entries on demand.";
}

if (!directive) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: directive,
    },
  })
);
