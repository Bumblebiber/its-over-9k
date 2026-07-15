#!/usr/bin/env node
// session-start.mjs — o9k-core SessionStart hook.
//
// The zero-effort switch: injects a compact doctrine directive so the agent
// applies all installed pillars automatically — the user never has to invoke
// or even know about them. Injects a DIRECTIVE only (~100 tokens), never
// documentation; the skills carry the detail and load on demand.
//
// On the very first o9k session it additionally tells the agent to offer the
// /o9k-guide orientation once. Disable everything via O9K_CORE_HOOK=off.

import {
  detectPillars,
  detectCompanions,
  detectConflicts,
  isFirstRun,
  markFirstRunDone,
  readStdinJson,
} from "./detect.mjs";

if (process.env.O9K_CORE_HOOK === "off") process.exit(0);

readStdinJson(); // drain stdin; payload not needed

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
const pillars = detectPillars(pluginRoot);
const companions = detectCompanions();
const conflicts = detectConflicts(pillars, companions);

const active = [];
if (pillars["o9k-caveman"]) active.push("compress output (caveman)");
if (pillars["o9k-scout"]) active.push("search-before-read, one repo map (scout)");
if (pillars["o9k-dispatch"]) active.push("isolate broad sweeps in subagents (dispatch)");
if (pillars["o9k-memory"]) active.push("persist state before compaction (memory)");

const lines = [
  "o9k efficiency framework active — apply its doctrine automatically; the user should never need to invoke it. " +
    (active.length
      ? "Standing orders: " + active.join("; ") + "."
      : "Load the using-o9k skill for the doctrine.") +
    " On any conflict between efficiency rules, the using-o9k arbitration table decides.",
];

if (conflicts.length) {
  lines.push("Arbitration needed (mention once, don't nag): " + conflicts.join(" "));
}

if (isFirstRun()) {
  lines.push(
    "First o9k session on this machine: briefly tell the user o9k is now active and fully " +
      "automatic, and offer the guided setup via /o9k-init (companions, git, conflict " +
      "resolution — run the o9k-init skill if they accept; /o9k-guide is the read-only " +
      "orientation). Do this once, at a natural moment — never interrupt an explicit task."
  );
  markFirstRunDone();
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: lines.join("\n"),
    },
  })
);
