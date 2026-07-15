#!/usr/bin/env node
// o9k-guide.mjs — setup report backing the /o9k-guide skill.
//
// Prints a plain-text snapshot of the o9k installation: pillars, memory
// backend, companions, live conflicts, and gaps. The o9k-guide skill turns
// this into a personalized orientation. Zero dependencies, read-only.

import {
  PILLARS,
  loadRegistry,
  detectPillars,
  detectCompanions,
  detectConflicts,
} from "./detect.mjs";

const REG = loadRegistry();

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
const pillars = detectPillars(pluginRoot);
const comp = detectCompanions();
const conflicts = detectConflicts(pillars, comp);

const mark = (v) => (v === null ? "?" : v ? "yes" : "no");

console.log("== o9k setup report ==");
console.log("");
console.log("Pillars:");
for (const p of PILLARS) console.log(`  ${p.padEnd(14)} ${mark(pillars[p])}`);

const backend = comp.tim ? "TIM" : comp.hmem ? "hmem" : "NONE";
console.log("");
console.log(`Memory backend: ${backend}`);

console.log("");
console.log("Companions detected:");
for (const [id, f] of Object.entries(REG.frameworks)) {
  if (f.kind !== "companion" || id === "hmem" || id === "tim") continue;
  console.log(`  ${f.label.padEnd(36)} ${mark(comp[id])}`);
}

console.log("");
if (conflicts.length) {
  console.log("Open arbitrations (resolve once):");
  for (const c of conflicts) console.log(`  ! ${c}`);
} else {
  console.log("Open arbitrations: none — setup is conflict-free.");
}

const gaps = [];
if (backend === "NONE")
  gaps.push("no memory backend — sessions start from zero. Fix: npm i -g hmem-mcp && hmem init");
for (const p of PILLARS) {
  if (pillars[p] === false) gaps.push(`pillar ${p} not installed — /plugin install ${p}@o9k`);
}
if (!comp.context7)
  gaps.push("Context7 not detected — zero-risk companion: claude mcp add context7 -- npx -y @upstash/context7-mcp");

console.log("");
if (gaps.length) {
  console.log("Gaps / suggestions:");
  for (const g of gaps) console.log(`  - ${g}`);
  console.log("  (bundle installer: install/o9k-companions.sh in the o9k repo, see docs/BUNDLES.md)");
} else {
  console.log("Gaps: none — full stack detected.");
}
