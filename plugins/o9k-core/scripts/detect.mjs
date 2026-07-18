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

/** O9K_DEBUG=1 makes swallowed hook errors visible (stderr + ~/.o9k/logs).
 *  Kept per-plugin — pillars deliberately don't import each other. */
export function debugLog(scope, err) {
  if (process.env.O9K_DEBUG !== "1") return;
  try {
    const line = `${new Date().toISOString()} [${scope}] ${err?.stack || err}\n`;
    process.stderr.write(line);
    const dir = path.join(os.homedir(), ".o9k", "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "hook-errors.log"), line);
  } catch {
    /* debug logging must never throw */
  }
}

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
    readJsonSafe(REGISTRY_PATH) || { concerns: {}, bundles: {}, frameworks: {}, hosts: {} }
  );
}

const REG = loadRegistry();

export const PILLARS = Object.keys(REG.frameworks).filter(
  (id) => REG.frameworks[id].kind === "pillar"
);

function onPath(bin, pathEnv) {
  if (pathEnv !== undefined) {
    for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
      if (fs.existsSync(path.join(dir, bin))) return true;
    }
    return false;
  }
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
function enabledPluginKeys(home = os.homedir()) {
  const s = readJsonSafe(path.join(home, ".claude", "settings.json"));
  if (!s || typeof s.enabledPlugins !== "object" || s.enabledPlugins === null) return null;
  return Object.entries(s.enabledPlugins)
    .filter(([, v]) => v)
    .map(([k]) => k.toLowerCase());
}

/** MCP server names from Claude user config (global scope), lowercased. */
function mcpServerNames(home = os.homedir()) {
  const cfg = readJsonSafe(path.join(home, ".claude.json"));
  if (!cfg || typeof cfg.mcpServers !== "object" || cfg.mcpServers === null) return [];
  return Object.keys(cfg.mcpServers).map((k) => k.toLowerCase());
}

/**
 * All detect fragments from the registry — used to subtract *known* tools from
 * a live inventory (open-world scan vs closed-world rival list).
 */
export function registryDetectIndex(reg = REG) {
  const plugins = new Set();
  const mcps = new Set();
  const bins = new Set();
  for (const [id, f] of Object.entries(reg.frameworks || {})) {
    if (f.kind === "pillar") plugins.add(String(id).toLowerCase());
    const d = f.detect || {};
    for (const p of d.plugin || []) plugins.add(String(p).toLowerCase());
    for (const m of d.mcp || []) mcps.add(String(m).toLowerCase());
    for (const b of d.path || []) bins.add(String(b).toLowerCase());
  }
  return { plugins, mcps, bins };
}

function pluginNameFromKey(key) {
  return String(key).split("@")[0].toLowerCase();
}

function isKnownPlugin(key, index) {
  const name = pluginNameFromKey(key);
  for (const p of index.plugins) {
    if (name === p || name.startsWith(p + "-")) return true;
  }
  return false;
}

function isKnownMcp(name, index) {
  const n = String(name).toLowerCase();
  for (const frag of index.mcps) {
    if (n === frag || n.includes(frag) || frag.includes(n)) return true;
  }
  // Memory backends also appear as companions with path-only detect (tim/hmem).
  for (const p of index.plugins) {
    if (n === p || n.includes(p)) return true;
  }
  for (const b of index.bins) {
    if (n === b || n.includes(b)) return true;
  }
  return false;
}

function isKnownSkill(name, index) {
  const n = String(name).toLowerCase();
  if (n === "o9k" || n.startsWith("o9k-")) return true;
  for (const p of index.plugins) {
    if (n === p || n.startsWith(p + "-") || n.includes(p)) return true;
  }
  for (const b of index.bins) {
    if (n === b || n.startsWith(b + "-")) return true;
  }
  return false;
}

/** Best-effort MCP server names from a host config file (JSON or TOML). */
export function mcpNamesFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".json")) {
    const j = readJsonSafe(filePath);
    if (!j || typeof j !== "object") return [];
    const servers = j.mcpServers || j.mcp || {};
    if (typeof servers !== "object" || servers === null) return [];
    return Object.keys(servers);
  }
  if (lower.endsWith(".toml")) {
    try {
      const text = fs.readFileSync(filePath, "utf8");
      const names = new Set();
      for (const m of text.matchAll(/\[mcp_servers\.([^\].]+)\]/gi)) names.add(m[1]);
      for (const m of text.matchAll(/\[mcp\.servers\.([^\].]+)\]/gi)) names.add(m[1]);
      return [...names];
    } catch {
      return [];
    }
  }
  return [];
}

function listDirNames(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink())
      .map((d) => d.name)
      .filter((n) => n && !n.startsWith("."));
  } catch {
    return [];
  }
}

/**
 * Open inventory of installed agent tooling across hosts — not limited to the
 * registry. Returns raw lists; use classifyInventory() for known/unknown split.
 */
export function collectInventory(options = {}) {
  const home = options.home || os.homedir();
  const hosts = options.hosts || detectHosts({ home, pathEnv: options.pathEnv });
  const plugins = enabledPluginKeys(home) || [];

  const mcps = [];
  const seenMcp = new Set();
  // Claude global MCP lives at ~/.claude.json (registry mcpRel).
  for (const name of mcpServerNames(home)) {
    const key = `claude:${name}`;
    if (seenMcp.has(key)) continue;
    seenMcp.add(key);
    mcps.push({ name, host: "claude" });
  }
  for (const h of Object.values(hosts)) {
    if (!h.mcpPath) continue;
    for (const name of mcpNamesFromFile(h.mcpPath)) {
      const key = `${h.id}:${name.toLowerCase()}`;
      if (seenMcp.has(key)) continue;
      seenMcp.add(key);
      mcps.push({ name: name.toLowerCase(), host: h.id });
    }
  }

  const skills = [];
  const seenSkill = new Set();
  const pushSkills = (hostId, dir) => {
    for (const name of listDirNames(dir)) {
      const key = `${hostId}:${name.toLowerCase()}`;
      if (seenSkill.has(key)) continue;
      seenSkill.add(key);
      skills.push({ name: name.toLowerCase(), host: hostId, path: path.join(dir, name) });
    }
  };
  // Skills triage is limited to shared + Claude user skills. Hermes/Codex/
  // OpenCode ship large stock skill trees that are not o9k rivals — listing
  // them as unknowns would drown the init interview.
  pushSkills("agents", path.join(home, ".agents", "skills"));
  // Nested package: ~/.agents/skills/o9k/<skill> — list children as o9k skills.
  for (const name of listDirNames(path.join(home, ".agents", "skills", "o9k"))) {
    const key = `agents:o9k/${name.toLowerCase()}`;
    if (seenSkill.has(key)) continue;
    seenSkill.add(key);
    skills.push({
      name: `o9k/${name.toLowerCase()}`,
      host: "agents",
      path: path.join(home, ".agents", "skills", "o9k", name),
    });
  }
  const claudeSkills = hosts.claude?.skillDir || path.join(home, ".claude", "skills");
  pushSkills("claude", claudeSkills);

  return { plugins, mcps, skills };
}

/**
 * Split the live inventory into registry-known vs unknown. Unknowns must NOT
 * be auto-researched — o9k-init asks the user for Go first.
 */
export function classifyInventory(options = {}) {
  const index = registryDetectIndex(options.registry || REG);
  const inv = collectInventory(options);
  const known = { plugins: [], mcps: [], skills: [] };
  const unknown = { plugins: [], mcps: [], skills: [] };

  for (const key of inv.plugins) {
    (isKnownPlugin(key, index) ? known.plugins : unknown.plugins).push(key);
  }
  for (const m of inv.mcps) {
    (isKnownMcp(m.name, index) ? known.mcps : unknown.mcps).push(m);
  }
  for (const s of inv.skills) {
    const leaf = s.name.includes("/") ? s.name.split("/").pop() : s.name;
    const knownSkill =
      isKnownSkill(s.name, index) ||
      isKnownSkill(leaf, index) ||
      s.name.startsWith("o9k/");
    (knownSkill ? known.skills : unknown.skills).push(s);
  }

  const unknownCount =
    unknown.plugins.length + unknown.mcps.length + unknown.skills.length;
  return { known, unknown, unknownCount, inventory: inv };
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

export function listHostDefs() {
  const hosts = loadRegistry().hosts || {};
  return Object.entries(hosts).map(([id, h]) => ({ id, ...h }));
}

export function detectHosts(options = {}) {
  const home = options.home || os.homedir();
  const pathEnv = options.pathEnv;
  const out = {};
  for (const def of listHostDefs()) {
    const bin = (def.bin || []).some((b) => onPath(b, pathEnv));
    const homeDir = def.homeRel ? path.join(home, def.homeRel) : null;
    const homeOk = !!(homeDir && fs.existsSync(homeDir));
    const joinRel = (rel) => (rel ? path.join(home, rel) : null);
    out[def.id] = {
      id: def.id,
      label: def.label || def.id,
      // A bin on PATH can be a false positive (generic name collision); a
      // leftover home dir alone can be a false positive too (uninstalled
      // tool, stale config). Require both when a homeRel is declared.
      present: bin && (!def.homeRel || homeOk),
      bin,
      home: homeOk,
      homeDir: homeOk ? homeDir : null,
      skillDir: joinRel(def.skillDirRel),
      hooksPath: joinRel(def.hooksRel),
      mcpPath: def.mcpRel ? path.join(home, def.mcpRel) : null,
      wireMode: def.wireMode,
      rulesDir: joinRel(def.rulesRel),
    };
  }
  return out;
}
