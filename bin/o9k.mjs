#!/usr/bin/env node
// o9k — thin CLI for the npm-distributed marketplace.
// Wraps existing o9k-core scripts with marketplace roots resolved from install path.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshHosts } from "../plugins/o9k-core/scripts/refresh-hosts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = path.resolve(here, "..");
const coreRoot = path.join(marketplaceRoot, "plugins", "o9k-core");
const scriptsDir = path.join(coreRoot, "scripts");

function rootedEnv() {
  return {
    ...process.env,
    O9K_MARKETPLACE_ROOT: marketplaceRoot,
    CLAUDE_PLUGIN_ROOT: coreRoot,
  };
}

function runScript(name, args = []) {
  const script = path.join(scriptsDir, name);
  const r = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env: rootedEnv(),
  });
  process.exit(r.status ?? 1);
}

function printHelp() {
  console.log(`o9k — token-efficiency meta-framework

Usage:
  o9k setup              Wire skills + hooks for detected hosts (Cursor/Codex/…)
  o9k doctor             Inventory o9k artifacts; flag stale paths
  o9k update             Check npm companions + o9k channels (read-only)
  o9k update --apply     Apply safe npm-global updates
  o9k help               Show this help

Install:
  npm i -g its-over-9k && o9k setup

Clean reinstall from its-over-9k@1.x (old hmem CLI — required):
  npm uninstall -g its-over-9k
  npm i -g hmem-mcp && hmem init
  npm i -g its-over-9k@latest && o9k setup

Claude Code (in-session marketplace — still recommended there):
  /plugin marketplace add Bumblebiber/its-over-9k
  /plugin install o9k-core@o9k
  …then /o9k-init

Marketplace root: ${marketplaceRoot}`);
}

function setup() {
  console.log("== o9k setup ==");
  console.log(`marketplace: ${marketplaceRoot}`);
  console.log("");

  const out = refreshHosts({
    dryRun: false,
    pluginRoot: coreRoot,
    marketplaceRoot,
  });
  console.log(
    `skills: linked=${out.skills.linked.length} rules=${out.skills.rules.length}` +
      ` errors=${out.skills.errors.length}`
  );
  for (const e of out.skills.errors) console.log(`  ! ${e}`);
  for (const row of out.hooks.results) {
    console.log(`  ${row.id.padEnd(12)} ${row.ok ? "ok" : "FAIL"}  ${row.detail}`);
  }
  console.log("");
  console.log("Claude Code — add the marketplace in a session (plugins are not");
  console.log("installed by this CLI):");
  console.log("  /plugin marketplace add Bumblebiber/its-over-9k");
  console.log("  /plugin install o9k-core@o9k        # required — arbitration + wiring");
  console.log("  then: /o9k-init      # picks the optional pillars with you");
  console.log("");
  console.log("Memory backend (recommended):");
  console.log("  npm i -g hmem-mcp && hmem init");
  console.log("");
  console.log("Coming from its-over-9k@1.x (old hmem CLI)? Clean reinstall:");
  console.log("  npm uninstall -g its-over-9k");
  console.log("  npm i -g hmem-mcp && hmem init");
  console.log("  npm i -g its-over-9k@latest && o9k setup");
  console.log("");

  const failed =
    out.hooks.results.some((x) => !x.ok) || out.skills.errors.length > 0;
  process.exit(failed ? 1 : 0);
}

const argv = process.argv.slice(2);
const cmd = argv[0] || "help";

if (cmd === "help" || cmd === "-h" || cmd === "--help") {
  printHelp();
  process.exit(0);
}

if (cmd === "setup") {
  setup();
}

if (cmd === "doctor") {
  runScript("o9k-doctor.mjs", argv.slice(1));
}

if (cmd === "update") {
  const rest = argv.slice(1);
  const flag = rest.includes("--apply")
    ? "--apply"
    : rest.includes("--refresh-hosts")
      ? "--refresh-hosts"
      : "--report";
  const extra = rest.filter(
    (a) => a !== "--apply" && a !== "--report" && a !== "--refresh-hosts"
  );
  runScript("update-check.mjs", [flag, ...extra]);
}

console.error(`o9k: unknown command '${cmd}' — try: o9k help`);
process.exit(2);
