#!/usr/bin/env node
// host-wire.mjs — orchestrate per-host hook wiring + verification heuristics.
//
// Zero dependencies. Calls host-specific wire modules; Claude (claude-plugin)
// skips hook merge because marketplace plugins own hooks.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { detectHosts, readJsonSafe } from "./detect.mjs";
import { wireCodex } from "./hosts/wire-codex.mjs";
import { wireCursor } from "./hosts/wire-cursor.mjs";
import { wireOpencode } from "./hosts/wire-opencode.mjs";
import { wireHermes } from "./hosts/wire-hermes.mjs";

const CANONICAL_PROBE = "using-o9k";
const O9K_HOOK_MARKER = /o9k/;

const WIRERS = {
  codex: wireCodex,
  cursor: wireCursor,
  opencode: wireOpencode,
  hermes: wireHermes,
};

function canonicalSkillPath(home) {
  return path.join(home, ".agents/skills/o9k", CANONICAL_PROBE, "SKILL.md");
}

function hasSkillSymlink(host) {
  if (!host.skillDir) return false;
  try {
    fs.lstatSync(path.join(host.skillDir, `o9k-${CANONICAL_PROBE}`));
    return true;
  } catch {
    return false;
  }
}

function hasCursorRules(host) {
  if (!host.rulesDir) return false;
  return fs.existsSync(path.join(host.rulesDir, `o9k-${CANONICAL_PROBE}.mdc`));
}

function verifySkills(host, home) {
  if (!fs.existsSync(canonicalSkillPath(home))) return "no";
  if (hasSkillSymlink(host) || hasCursorRules(host)) return "yes";
  return "no";
}

function readHooksContent(host) {
  const hooksPath = host.hooksPath;
  if (!hooksPath) return "";
  try {
    const st = fs.statSync(hooksPath);
    if (st.isDirectory()) {
      let out = "";
      for (const name of fs.readdirSync(hooksPath)) {
        if (!O9K_HOOK_MARKER.test(name)) continue;
        try {
          out += fs.readFileSync(path.join(hooksPath, name), "utf8");
        } catch {
          /* skip unreadable plugin files */
        }
      }
      return out;
    }
    return fs.readFileSync(hooksPath, "utf8");
  } catch {
    return "";
  }
}

function verifyClaudeHooks(home, pluginRoot) {
  const s = readJsonSafe(path.join(home, ".claude", "settings.json"));
  if (s && typeof s.enabledPlugins === "object" && s.enabledPlugins !== null) {
    const keys = Object.entries(s.enabledPlugins)
      .filter(([, v]) => v)
      .map(([k]) => k.toLowerCase());
    return keys.some((k) => k.startsWith("o9k-core@")) ? "yes" : "no";
  }
  if (pluginRoot) {
    try {
      return fs.existsSync(path.join(pluginRoot, "..", "o9k-core")) ? "yes" : "no";
    } catch {
      return "no";
    }
  }
  return "no";
}

function verifyHooks(host, home, pluginRoot) {
  if (host.wireMode === "claude-plugin") {
    return verifyClaudeHooks(home, pluginRoot);
  }
  return O9K_HOOK_MARKER.test(readHooksContent(host)) ? "yes" : "no";
}

function verifyMcp(host) {
  if (!host.mcpPath) return "?";
  try {
    if (!fs.existsSync(host.mcpPath)) return "no";
    const content = fs.readFileSync(host.mcpPath, "utf8").toLowerCase();
    return /hmem|tim/.test(content) ? "yes" : "no";
  } catch {
    return "?";
  }
}

/** Best-effort skills/hooks/mcp status for one detected host. */
export function verifyHost(host, home, pluginRoot = "") {
  return {
    skills: verifySkills(host, home),
    hooks: verifyHooks(host, home, pluginRoot),
    mcp: verifyMcp(host),
  };
}

/** Wire hooks for each present host (or `only` list); per-host failures are isolated. */
export function wireHosts(options) {
  const home = options.home ?? os.homedir();
  const marketplaceRoot = options.marketplaceRoot;
  const dryRun = !!options.dryRun;
  const only = options.only?.map((s) => s.toLowerCase());

  const detectOpts = { home };
  if (options.pathEnv !== undefined) detectOpts.pathEnv = options.pathEnv;
  const hosts = detectHosts(detectOpts);
  const results = [];

  for (const [id, host] of Object.entries(hosts)) {
    if (only && !only.includes(id)) continue;
    if (!only && !host.present) continue;

    if (host.wireMode === "claude-plugin") {
      results.push({ id, ok: true, detail: "claude-plugin: skipped hook merge" });
      continue;
    }

    const wirer = WIRERS[id];
    if (!wirer) {
      results.push({ id, ok: false, detail: `no wirer for ${id}` });
      continue;
    }

    try {
      const r = wirer({ home, marketplaceRoot, dryRun });
      results.push({ id, ok: r.ok, detail: r.detail });
    } catch (e) {
      results.push({ id, ok: false, detail: e.message });
    }
  }

  return { results };
}

function parseCli(argv) {
  const dryRun = argv.includes("--dry-run");
  const run = argv.includes("--run");
  if (dryRun === run) {
    throw new Error("usage: host-wire.mjs --dry-run | --run [--only=codex,cursor]");
  }
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : undefined;
  return { dryRun, only };
}

function defaultMarketplaceRoot() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) return path.join(pluginRoot, "..");
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { dryRun, only } = parseCli(process.argv.slice(2));
    const r = wireHosts({
      home: process.env.HOME,
      marketplaceRoot: defaultMarketplaceRoot(),
      dryRun,
      only,
    });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.results.every((x) => x.ok) ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
