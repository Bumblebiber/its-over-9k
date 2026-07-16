#!/usr/bin/env node
// refresh-hosts.mjs — re-sync shared skills + re-wire host hooks after an
// o9k plugin/marketplace update. Idempotent; skips absent hosts; never
// installs CLI binaries. Used by /o9k-update and as a standalone CLI.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncSkills } from "./skills-sync.mjs";
import { wireHosts } from "./host-wire.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{
 *   dryRun?: boolean,
 *   home?: string,
 *   pluginRoot?: string,
 *   marketplaceRoot?: string,
 *   only?: string[],
 * }} options
 * @returns {{ skills: object, hooks: object }}
 */
export function refreshHosts(options = {}) {
  const pluginRoot =
    options.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || path.join(here, "..");
  const marketplaceRoot =
    options.marketplaceRoot ||
    process.env.O9K_MARKETPLACE_ROOT ||
    path.join(pluginRoot, "..");
  const dryRun = !!options.dryRun;

  const skills = syncSkills({
    home: options.home,
    pluginRoot,
    marketplaceRoot,
    dryRun,
  });
  const hooks = wireHosts({
    home: options.home,
    marketplaceRoot,
    dryRun,
    only: options.only,
  });
  return { skills, hooks };
}

function printReport(out, dryRun) {
  console.log("== o9k host refresh ==");
  console.log(`mode: ${dryRun ? "dry-run" : "run"}`);
  console.log("");
  console.log("skills:");
  console.log(
    `  canonical: ${out.skills.canonical}` +
      `  linked=${out.skills.linked.length}` +
      `  rules=${out.skills.rules.length}` +
      `  errors=${out.skills.errors.length}`
  );
  for (const e of out.skills.errors) console.log(`  ! ${e}`);
  console.log("");
  console.log("hooks:");
  for (const row of out.hooks.results) {
    console.log(`  ${row.id.padEnd(12)} ${row.ok ? "ok" : "FAIL"}  ${row.detail}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "usage: refresh-hosts.mjs [--run|--dry-run] [--only=codex,cursor,…]"
    );
    process.exit(0);
  }
  const dryRun = argv.includes("--dry-run") && !argv.includes("--run");
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const only = onlyArg
    ? onlyArg.slice("--only=".length).split(",").filter(Boolean)
    : undefined;
  const out = refreshHosts({ dryRun, only });
  printReport(out, dryRun);
  const failed =
    out.hooks.results.some((x) => !x.ok) || out.skills.errors.length > 0;
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
