// detect.mjs — shared setup detection for o9k-core (hook + /o9k-guide).
//
// Zero dependencies. Everything degrades gracefully: a probe that can't run
// reports `null` (unknown), never throws. Set O9K_CORE_HOOK=off to disable
// the o9k-core SessionStart hook entirely.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PILLARS = [
  "o9k-core",
  "o9k-caveman",
  "o9k-scout",
  "o9k-dispatch",
  "o9k-memory",
  "o9k-recon",
];

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

/** Companion frameworks from the compatibility matrix. */
export function detectCompanions() {
  const keys = enabledPluginKeys() || [];
  const mcp = mcpServerNames();
  return {
    hmem: onPath("hmem") || mcp.includes("hmem"),
    tim: !!process.env.TIM_CLI || onPath("tim"),
    context7: mcp.some((s) => s.includes("context7")),
    serena: mcp.some((s) => s.includes("serena")),
    superpowers: keys.some((k) => k.startsWith("superpowers@")),
    ponytail: keys.some((k) => k.startsWith("ponytail@")),
    beads: onPath("bd"),
    astGrep: onPath("ast-grep") || onPath("sg"),
    ccusage: onPath("ccusage"),
  };
}

/** Arbitrations the user must resolve once (matrix ⚠️ cells that are live). */
export function detectConflicts(pillars, comp) {
  const c = [];
  if (pillars["o9k-dispatch"] && comp.superpowers) {
    c.push(
      "dispatch has two owners: o9k-dispatch AND superpowers' dispatch skills — keep one, disable the other."
    );
  }
  if (comp.hmem && comp.tim) {
    c.push("two memory backends on PATH (hmem AND tim) — the hooks prefer TIM; uninstall one to be unambiguous.");
  }
  return c;
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
