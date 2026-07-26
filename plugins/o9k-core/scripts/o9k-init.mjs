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
  classifyInventory,
} from "./detect.mjs";
import { verifyHost } from "./host-wire.mjs";

const REG = loadRegistry();
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
const pillars = detectPillars(pluginRoot);
const comp = detectCompanions();
const rivals = detectRivals();
const conflicts = detectConflicts(pillars, comp);
const classified = classifyInventory({ home: os.homedir() });

const mark = (v) => (v === null ? "?" : v ? "yes" : "no");
const label = (id) => REG.frameworks[id]?.label || id;

const PLATFORM_NOTES = {
  linux: "linux — full support",
  darwin: "macOS — full support. The team-up companion additionally needs tmux (brew install tmux).",
  win32:
    "Windows — all pillars work. The team-up companion (multi-agent runtime) " +
    "needs tmux/bash and therefore WSL.",
};

console.log("== o9k init snapshot ==");
console.log("");
console.log(`Platform: ${PLATFORM_NOTES[process.platform] || process.platform}`);
console.log("");
console.log("Pillars (o9k-core required, every other one opt-in — ask per pillar):");
for (const p of PILLARS) {
  const f = REG.frameworks[p] || {};
  console.log(`  ${p.padEnd(14)} ${mark(pillars[p])}${f.required ? "   [required]" : ""}`);
  if (f.audience) console.log(`      for:     ${f.audience}`);
  if (f.notFor) console.log(`      not for: ${f.notFor}`);
}

console.log("");
console.log("Essentials:");
console.log(`  git                                  ${mark(comp.git)}`);
const backend =
  comp.tim && comp.hmem
    ? "TIM+hmem (pick one — hooks prefer TIM)"
    : comp.tim
      ? "TIM"
      : comp.hmem
        ? "hmem"
        : "NONE";
console.log(`  memory backend                       ${backend}`);
console.log(
  "  memory choices                       TIM (npm tim-cli) | hmem (npm hmem-mcp) | custom MCP",
);

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

// Formerly pillars, now their own repos. They are ordinary companions, but the
// interview should offer them with the same for/not-for framing as a pillar.
const spun = Object.entries(REG.frameworks).filter(([, f]) => f.wasPillar);
if (spun.length) {
  console.log("");
  console.log("Spun out of o9k (own repos — offer like a pillar, opt-in):");
  for (const [id, f] of spun) {
    console.log(`  ${id.padEnd(16)} ${mark(comp[id])}   (was ${f.wasPillar})`);
    if (f.audience) console.log(`      for:     ${f.audience}`);
    if (f.notFor) console.log(`      not for: ${f.notFor}`);
    if (f.caveats) console.log(`      caveat:  ${f.caveats}`);
    if (f.install) console.log(`      install: ${f.install}`);
  }
}

// Bundle membership from the registry — lets the skill present each bundle
// as a delta.
console.log("");
console.log("Bundle deltas (missing pieces only):");
for (const [name, members] of Object.entries(REG.bundles)) {
  // TIM fills the memory slot — don't list hmem as missing when TIM is present.
  const missing = members.filter((m) => {
    if (m === "hmem" && comp.tim) return false;
    return !comp[m];
  });
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

console.log("");
const u = classified.unknown;
if (classified.unknownCount) {
  console.log(
    "Unknown installed (NOT in compat/registry.json) — ask before evaluating:"
  );
  for (const key of u.plugins) console.log(`  plugin  ${key}`);
  for (const m of u.mcps) console.log(`  mcp     ${m.name} (${m.host})`);
  const skillsByName = new Map();
  for (const s of u.skills) {
    const hosts = skillsByName.get(s.name) || [];
    if (!hosts.includes(s.host)) hosts.push(s.host);
    skillsByName.set(s.name, hosts);
  }
  for (const [name, hosts] of skillsByName) {
    console.log(`  skill   ${name} (${hosts.join(", ")})`);
  }
  console.log(
    "  → Do NOT research GitHub/README or run trials without explicit user Go."
  );
  console.log(
    "  → On Go: framework-scout (README) → if still unclear, trial / the bundle-bench companion."
  );
  console.log(
    "  → If better than an o9k pick: propose Issue/PR to its-over-9k."
  );
} else {
  console.log("Unknown installed: none (everything matched the registry).");
}
