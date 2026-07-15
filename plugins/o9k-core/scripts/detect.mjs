// detect.mjs — shared setup detection for o9k-core (hook + /o9k-guide + /o9k-init).
//
// Zero dependencies. Everything degrades gracefully: a probe that can't run
// reports `null` (unknown), never throws. Set O9K_CORE_HOOK=off to disable
// the o9k-core SessionStart hook entirely.
//
// All framework knowledge (who claims which concern, how to detect it, why a
// bundle pick beats a rival) lives in ../compat/registry.json — this file is
// only the probe engine. Adding a framework = adding a registry entry.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const REGISTRY_PATH = fileURLToPath(new URL("../compat/registry.json", import.meta.url));

/** The compatibility registry — single source of truth for concerns/frameworks/bundles. */
export function loadRegistry() {
  return (
    readJsonSafe(REGISTRY_PATH) || { concerns: {}, bundles: {}, frameworks: {} }
  );
}

const REG = loadRegistry();

export const PILLARS = Object.keys(REG.frameworks).filter(
  (id) => REG.frameworks[id].kind === "pillar"
);

function onPath(bin) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Plugin keys ("name@marketplace") enabled in user settings, or null if unknown. */
function enabledPluginKeys() {
  const s = readJsonSafe(path.join(os.homedir(), ".claude", "settings.json"));
  if (!s || typeof s.enabledPlugins !== "object" || s.enabledPlugins === null) return null;
  return Object.entries(s.enabledPlugins)
    .filter(([, v]) => v)
    .map(([k]) => k.toLowerCase());
}

/** MCP server names from user config (global scope), lowercased. */
function mcpServerNames() {
  const cfg = readJsonSafe(path.join(os.homedir(), ".claude.json"));
  if (!cfg || typeof cfg.mcpServers !== "object" || cfg.mcpServers === null) return [];
  return Object.keys(cfg.mcpServers).map((k) => k.toLowerCase());
}

/** Run a registry `detect` spec. A miss means "not detected", never "not installed". */
function probe(spec, keys, mcp) {
  if (!spec) return false;
  if (spec.plugin && spec.plugin.some((n) => keys.some((k) => k.startsWith(n + "@")))) return true;
  if (spec.mcp && spec.mcp.some((frag) => mcp.some((s) => s.includes(frag)))) return true;
  if (spec.env && spec.env.some((v) => !!process.env[v])) return true;
  if (spec.path && spec.path.some((bin) => onPath(bin))) return true;
  return false;
}

function detectByKind(kinds) {
  const keys = enabledPluginKeys() || [];
  const mcp = mcpServerNames();
  const out = {};
  for (const [id, f] of Object.entries(REG.frameworks)) {
    if (kinds.includes(f.kind)) out[id] = probe(f.detect, keys, mcp);
  }
  return out;
}

/** Which o9k pillars are present. true/false, or null when undeterminable. */
export function detectPillars(pluginRoot) {
  const keys = enabledPluginKeys();
  const out = {};
  for (const p of PILLARS) {
    if (keys) {
      out[p] = keys.some((k) => k.startsWith(p + "@"));
    } else if (pluginRoot) {
      // Marketplace clones keep sibling plugins side by side.
      out[p] = fs.existsSync(path.join(pluginRoot, "..", p));
    } else {
      out[p] = null;
    }
  }
  return out;
}

/** Companion frameworks + essentials (git) from the registry. */
export function detectCompanions() {
  return detectByKind(["companion", "essential"]);
}

/**
 * Rival frameworks: tools that claim a concern an o9k pillar or bundled
 * companion already owns (🔴 rows of the matrix).
 */
export function detectRivals() {
  return detectByKind(["rival"]);
}

/**
 * Arbitrations the user must resolve once: any *exclusive* concern with two
 * detected owners among pillars/companions (rivals are reported separately).
 */
export function detectConflicts(pillars, comp) {
  const owners = {}; // concern -> [framework id]
  for (const [id, f] of Object.entries(REG.frameworks)) {
    if (f.kind === "rival") continue;
    const detected = f.kind === "pillar" ? pillars[id] : comp[id];
    if (!detected) continue;
    for (const c of f.concerns || []) (owners[c] ??= []).push(id);
  }
  const out = [];
  for (const [concern, ids] of Object.entries(owners)) {
    const meta = REG.concerns[concern];
    if (!meta?.exclusive || ids.length < 2) continue;
    out.push(
      `${concern} has two owners: ${ids.join(" AND ")} — one owner per concern; ` +
        (meta.note || "keep one, disable the other.")
    );
  }
  return out;
}

const MARKER = path.join(os.homedir(), ".claude", "o9k-first-run-done");

export function isFirstRun() {
  return !fs.existsSync(MARKER);
}

export function markFirstRunDone() {
  try {
    fs.mkdirSync(path.dirname(MARKER), { recursive: true });
    fs.writeFileSync(MARKER, new Date().toISOString() + "\n");
  } catch {
    /* marker is best-effort; worst case the offer repeats once */
  }
}
