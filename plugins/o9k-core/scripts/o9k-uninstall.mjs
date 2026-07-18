#!/usr/bin/env node
// o9k-uninstall.mjs — reverse of syncSkills + wireHosts.
//
// Removes everything o9k wrote OUTSIDE the marketplace clone: canonical
// skills, host skill symlinks, Cursor rules, hook wrappers, hooks.json /
// config.yaml entries, the OpenCode plugin file. Never touches user data
// (~/.o9k roster/usage/runs stay) and never removes foreign content — only
// artifacts that are provably ours (o9k- prefix, o9k markers, symlinks).
//
// Claude Code plugins themselves are uninstalled via /plugin, and systemd /
// launchd units via systemctl / launchctl — this script prints those as
// manual follow-ups instead of guessing.
//
// Usage: o9k-uninstall.mjs --dry-run | --run

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { detectHosts, readJsonSafe } from "./detect.mjs";
import { mergeHooksJson, mergeCursorHooksJson } from "./hook-merge.mjs";
import { stripHermesO9kHooksYaml } from "./hosts/wire-hermes.mjs";

function listMatching(dir, re) {
  try {
    return fs.readdirSync(dir).filter((n) => re.test(n)).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

function removePath(p, { dryRun, removed, errors }) {
  try {
    fs.lstatSync(p); // throws when p doesn't exist (incl. dangling check via lstat)
  } catch {
    return;
  }
  try {
    if (!dryRun) fs.rmSync(p, { recursive: true, force: true });
    removed.push(p);
  } catch (e) {
    errors.push(`${p}: ${e.message}`);
  }
}

/** Drop hook groups/events left empty after the o9k strip. */
function pruneEmptyNested(config) {
  for (const [event, groups] of Object.entries(config.hooks ?? {})) {
    config.hooks[event] = (groups ?? []).filter((g) => (g.hooks ?? []).length > 0);
    if (config.hooks[event].length === 0) delete config.hooks[event];
  }
  return config;
}

function pruneEmptyFlat(config) {
  for (const [event, entries] of Object.entries(config.hooks ?? {})) {
    if ((entries ?? []).length === 0) delete config.hooks[event];
  }
  return config;
}

function stripHooksJson(filePath, { flat, dryRun, changedFiles, errors }) {
  const existing = readJsonSafe(filePath);
  if (!existing) return;
  try {
    // Merging an EMPTY patch strips all o9k-owned entries from every event.
    const stripped = flat
      ? pruneEmptyFlat(mergeCursorHooksJson(existing, {}))
      : pruneEmptyNested(mergeHooksJson(existing, {}));
    const next = `${JSON.stringify(stripped, null, 2)}\n`;
    if (next !== `${JSON.stringify(existing, null, 2)}\n`) {
      if (!dryRun) fs.writeFileSync(filePath, next);
      changedFiles.push(filePath);
    }
  } catch (e) {
    errors.push(`${filePath}: ${e.message}`);
  }
}

/**
 * @param {{ home?: string, dryRun?: boolean, pathEnv?: string }} [options]
 * @returns {{ removed: string[], changedFiles: string[], errors: string[], manual: string[] }}
 */
export function uninstall(options = {}) {
  const home = options.home ?? os.homedir();
  const dryRun = !!options.dryRun;
  const removed = [];
  const changedFiles = [];
  const errors = [];
  const ctx = { dryRun, removed, errors };

  // Artifacts are path-based — clean them up even for hosts whose binary is
  // gone, so pass an empty pathEnv-independent walk over all host defs.
  const detectOpts = { home };
  if (options.pathEnv !== undefined) detectOpts.pathEnv = options.pathEnv;
  const hosts = detectHosts(detectOpts);

  for (const host of Object.values(hosts)) {
    // Skill symlinks (only symlinks — foreign dirs named o9k-* stay put).
    if (host.skillDir) {
      for (const p of listMatching(host.skillDir, /^o9k-/)) {
        try {
          if (!fs.lstatSync(p).isSymbolicLink()) continue;
        } catch {
          continue;
        }
        removePath(p, ctx);
      }
    }
    // Cursor rules.
    if (host.rulesDir) {
      for (const p of listMatching(host.rulesDir, /^o9k-.*\.mdc$/)) removePath(p, ctx);
    }
  }

  // Hook wrappers + host config entries.
  for (const dir of [
    path.join(home, ".codex/hooks"),
    path.join(home, ".cursor/hooks"),
    path.join(home, ".hermes/agent-hooks"),
  ]) {
    for (const p of listMatching(dir, /^o9k-.*\.sh$/)) removePath(p, ctx);
  }
  stripHooksJson(path.join(home, ".codex/hooks.json"), { flat: false, dryRun, changedFiles, errors });
  stripHooksJson(path.join(home, ".cursor/hooks.json"), { flat: true, dryRun, changedFiles, errors });

  const hermesConfig = path.join(home, ".hermes/config.yaml");
  try {
    const yaml = fs.readFileSync(hermesConfig, "utf8");
    const stripped = stripHermesO9kHooksYaml(yaml);
    if (stripped !== yaml) {
      if (!dryRun) fs.writeFileSync(hermesConfig, stripped);
      changedFiles.push(hermesConfig);
    }
  } catch (e) {
    if (e.code !== "ENOENT") errors.push(`${hermesConfig}: ${e.message}`);
  }

  for (const p of [
    path.join(home, ".config/opencode/plugins/o9k.ts"),
    path.join(home, ".config/opencode/plugins/o9k.ts.o9k-bak"),
  ]) {
    removePath(p, ctx);
  }

  // Canonical skills last — symlinks above pointed here.
  removePath(path.join(home, ".agents/skills/o9k"), ctx);

  const manual = [
    "Claude Code plugins: /plugin uninstall o9k-<pillar>@o9k (repeat per pillar), then /plugin marketplace remove o9k",
    "systemd (Linux): systemctl --user disable --now o9k-usage-watcher o9k-resume; rm ~/.config/systemd/user/o9k-*.service",
    "launchd (macOS): launchctl bootout gui/$(id -u)/com.o9k.usage-watcher (and com.o9k.resume); rm ~/Library/LaunchAgents/com.o9k.*.plist",
    "~/.local/bin/o9k-usage-watcher and ~/.local/bin/o9k-runs symlinks, if you created them",
    "User data kept on purpose: ~/.o9k (roster.json, usage.json, runs/, logs/) — delete manually if wanted",
  ];

  return { removed, changedFiles, errors, manual };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const run = argv.includes("--run");
  if (dryRun === run) {
    console.error("usage: o9k-uninstall.mjs --dry-run | --run");
    process.exit(2);
  }
  const r = uninstall({ dryRun });
  console.log(`== o9k uninstall (${dryRun ? "dry-run" : "run"}) ==`);
  for (const p of r.removed) console.log(`  ${dryRun ? "would remove" : "removed"}: ${p}`);
  for (const f of r.changedFiles) console.log(`  ${dryRun ? "would strip" : "stripped"} o9k entries: ${f}`);
  if (!r.removed.length && !r.changedFiles.length) console.log("  nothing to remove.");
  for (const e of r.errors) console.log(`  ! ${e}`);
  console.log("");
  console.log("Manual follow-ups:");
  for (const m of r.manual) console.log(`  - ${m}`);
  process.exit(r.errors.length ? 1 : 0);
}
