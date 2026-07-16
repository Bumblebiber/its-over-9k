#!/usr/bin/env node
// o9k-init.mjs — setup snapshot backing the /o9k-init skill.
//
// Prints everything the guided first-install flow needs in one read-only
// pass: pillars, companions (incl. git), rival frameworks that collide with
// the bundles (with the WHY and the migration path straight from the compat
// registry), and live arbitrations. The o9k-init skill turns this into the
// interview + install plan. Zero dependencies, changes nothing.

import os from "node:os";
import {
  PILLARS,
  loadRegistry,
  detectPillars,
  detectCompanions,
  detectConflicts,
  detectRivals,
  detectHosts,
} from "./detect.mjs";
import { verifyHost } from "./host-wire.mjs";

const REG = loadRegistry();
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
const pillars = detectPillars(pluginRoot);
const comp = detectCompanions();
const rivals = detectRivals();
const conflicts = detectConflicts(pillars, comp);

const mark = (v) => (v === null ? "?" : v ? "yes" : "no");
const label = (id) => REG.frameworks[id]?.label || id;

console.log("== o9k init snapshot ==");
console.log("");
console.log("Pillars:");
for (const p of PILLARS) console.log(`  ${p.padEnd(14)} ${mark(pillars[p])}`);

console.log("");
console.log("Essentials:");
console.log(`  git                                  ${mark(comp.git)}`);
const backend = comp.tim ? "TIM" : comp.hmem ? "hmem" : "NONE";
console.log(`  memory backend                       ${backend}`);

const hosts = detectHosts({ home: os.homedir() });
console.log("");
console.log("Hosts:");
for (const h of Object.values(hosts)) {
  const v = verifyHost(h, os.homedir(), pluginRoot);
  const status = h.present ? "present" : "absent";
  console.log(
    `  ${h.label.padEnd(36)} ${status}  skills=${v.skills} hooks=${v.hooks} mcp=${v.mcp}`,
  );
}

console.log("");
console.log("Companions detected:");
for (const [id, f] of Object.entries(REG.frameworks)) {
  if (f.kind !== "companion" || id === "tim") continue;
  console.log(`  ${f.label.padEnd(36)} ${mark(comp[id])}`);
}

// Bundle membership from the registry — lets the skill present each bundle
// as a delta.
console.log("");
console.log("Bundle deltas (missing pieces only):");
for (const [name, members] of Object.entries(REG.bundles)) {
  const missing = members.filter((m) => !comp[m]);
  console.log(
    `  ${name.padEnd(12)} ${missing.length ? "needs: " + missing.join(", ") : "complete"}`
  );
}

console.log("");
const live = Object.entries(REG.frameworks).filter(
  ([id, f]) => f.kind === "rival" && rivals[id]
);
if (live.length) {
  console.log("Rival frameworks detected (collide with a pillar or bundle pick):");
  for (const [id, f] of live) {
    console.log(`  ! ${f.label} (vs ${f.vs})`);
    if (f.why) console.log(`      why ours: ${f.why}`);
    if (f.migrate?.adapter)
      console.log(
        `      migrate: node "\${CLAUDE_PLUGIN_ROOT}/scripts/o9k-migrate.mjs" ${id}` +
          (f.migrate.target ? `  → ${label(f.migrate.target)}` : "")
      );
  }
} else {
  console.log("Rival frameworks: none detected.");
}

console.log("");
if (conflicts.length) {
  console.log("Open arbitrations:");
  for (const c of conflicts) console.log(`  ! ${c}`);
} else {
  console.log("Open arbitrations: none.");
}
