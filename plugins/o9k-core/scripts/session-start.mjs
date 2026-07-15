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
  loadRegistry,
  PILLARS,
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
  "MANDATORY, not a suggestion: o9k's installed pillars apply to EVERY response in this " +
    "session, starting with your very next one. Not \"when convenient\" — every turn. " +
    (active.length
      ? "Standing orders: " + active.join("; ") + "."
      : "Load the using-o9k skill for the doctrine.") +
    " If you catch yourself having skipped one (verbose output, unstructured search, a " +
    "flagship model doing grunt work), that's not a pass — correct it starting the next " +
    "turn, don't wait to be told. On any conflict between efficiency rules, the using-o9k " +
    "arbitration table decides.",
];

if (conflicts.length) {
  lines.push("Arbitration needed (mention once, don't nag): " + conflicts.join(" "));
}

// Drift check: a pillar this machine had before (there's a settings.json to
// read at all — pillars isn't null) but that's now missing/disabled.
const reg = loadRegistry();
const missingPillars = PILLARS.filter(
  (id) => id !== "o9k-core" && pillars[id] === false
);
if (missingPillars.length) {
  const labels = missingPillars.map((id) => reg.frameworks[id]?.label || id);
  lines.push(
    "Pillar drift detected: " +
      labels.join(", ") +
      (missingPillars.length > 1 ? " are" : " is") +
      " missing or disabled — the doctrine above assumes the full stack. Mention it once " +
      "to the user and suggest `claude plugin install " +
      missingPillars[0] +
      "@o9k` (or /o9k-init to fix all gaps at once)."
  );
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
