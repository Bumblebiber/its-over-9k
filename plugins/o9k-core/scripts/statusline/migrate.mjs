#!/usr/bin/env node
// migrate.mjs — Init Actions A/B/C for TIM ↔ o9k statusline coexistence.
//
//   A "remove-tim" — strip TIM host wiring, then wire o9k with replace.
//   B "keep-tim"   — leave TIM's Claude/Cursor command in place (skip o9k
//                    there); Hermes has no equivalent "leave it alone" mode
//                    (it renders one status bar from cli.py, not a
//                    replaceable command), so o9k stacks alongside TIM's
//                    patch there and we surface a stacking warning for the
//                    interview/doctor to show.
//   C "abort"      — no config write, no strip, no wire.
import os from "node:os";
import { pathToFileURL } from "node:url";
import { defaultConfig, saveConfig } from "./config.mjs";
import { detectTimStatusline } from "./detect-tim.mjs";
import { stripTimStatusline } from "./strip-tim.mjs";
import { wireAllStatusline, defaultMarketplaceRoot } from "./wire-all.mjs";

const HOST_IDS = ["claude", "cursor", "hermes"];

/** Per-host wire mode for one host under the given action/detection state. */
function decideMode({ host, action, hostsPresent, detect }) {
  if (!hostsPresent[host]) return "skip";
  if (action !== "keep-tim") return "replace";
  // Hermes has no "keep" wire mode that still installs o9k — replace always
  // stacks alongside any existing (TIM/foreign) patch. Claude/Cursor's
  // "keep" mode leaves an existing non-o9k command (TIM's) untouched.
  if (host === "hermes") return "replace";
  return detect[host] ? "keep" : "replace";
}

/**
 * @param {object} opts
 * @param {string} opts.home
 * @param {string} opts.marketplaceRoot
 * @param {"remove-tim"|"keep-tim"|"abort"} opts.action
 * @param {string[]} [opts.elements]
 * @param {{claude?: boolean, cursor?: boolean, hermes?: boolean}} [opts.hostsPresent]
 * @param {boolean} [opts.dryRun]
 */
export function migrateTimStatusline({
  home,
  marketplaceRoot,
  action,
  elements,
  hostsPresent = { claude: true, cursor: true, hermes: true },
  dryRun = false,
}) {
  if (action === "abort") {
    return {
      aborted: true,
      detect: detectTimStatusline({ home }),
      stripResults: null,
      wireResults: null,
      warnings: [],
    };
  }

  if (action !== "remove-tim" && action !== "keep-tim") {
    throw new Error(`unknown action: ${action}`);
  }

  const detect = detectTimStatusline({ home });
  const warnings = [];

  const stripResults =
    action === "remove-tim" ? stripTimStatusline({ home, dryRun }) : null;

  const hostModes = {};
  for (const host of HOST_IDS) {
    hostModes[host] = decideMode({ host, action, hostsPresent, detect });
  }

  if (action === "keep-tim" && hostsPresent.hermes && detect.hermes) {
    warnings.push("hermes: TIM+o9k prefixes may stack in the TUI status bar");
  }

  if (!dryRun) {
    saveConfig(defaultConfig({ enabled: true, ...(elements ? { elements } : {}) }));
  }

  const { results } = wireAllStatusline({ home, marketplaceRoot, hosts: hostModes, dryRun });
  const wireResults = {};
  for (const r of results) wireResults[r.id] = r;

  return { aborted: false, detect, stripResults, wireResults, warnings };
}

function parseListArg(spec) {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCli(argv) {
  let action;
  let elementsSpec;
  let marketplaceRoot;
  let home = os.homedir();
  let hostsPresentSpec;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--action") {
      action = argv[++i];
      continue;
    }
    if (arg === "--elements") {
      elementsSpec = argv[++i];
      continue;
    }
    if (arg === "--marketplace") {
      marketplaceRoot = argv[++i];
      continue;
    }
    if (arg === "--home") {
      home = argv[++i];
      continue;
    }
    if (arg === "--hosts-present") {
      hostsPresentSpec = argv[++i];
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!action) {
    throw new Error(
      "usage: migrate.mjs --action remove-tim|keep-tim|abort --elements a,b,c [--marketplace <dir>] [--home DIR] [--hosts-present claude,cursor,hermes] [--dry-run]",
    );
  }

  const hostsPresent = { claude: false, cursor: false, hermes: false };
  if (hostsPresentSpec) {
    for (const host of parseListArg(hostsPresentSpec)) {
      hostsPresent[host] = true;
    }
  }

  return {
    home,
    marketplaceRoot: marketplaceRoot ?? defaultMarketplaceRoot(),
    action,
    elements: elementsSpec ? parseListArg(elementsSpec) : undefined,
    hostsPresent,
    dryRun,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const opts = parseCli(process.argv.slice(2));
    const result = migrateTimStatusline(opts);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
