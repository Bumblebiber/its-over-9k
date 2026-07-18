#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { wireClaudeStatusline } from "./wire-claude.mjs";
import { wireCursorStatusline } from "./wire-cursor.mjs";
import { wireHermesStatusline } from "./wire-hermes.mjs";
import { wireCodexStatusline } from "./wire-codex.mjs";
import { wireOpencodeStatusline } from "./wire-opencode.mjs";

const WIRERS = {
  claude: wireClaudeStatusline,
  cursor: wireCursorStatusline,
  hermes: wireHermesStatusline,
  codex: wireCodexStatusline,
  opencode: wireOpencodeStatusline,
};

/** Parse `claude:replace,cursor:keep` into `{ claude: "replace", cursor: "keep" }`. */
export function parseHostsArg(spec) {
  const hosts = {};
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const colon = part.indexOf(":");
    if (colon === -1) {
      throw new Error(`invalid host spec "${part}" — expected host:mode`);
    }
    const id = part.slice(0, colon).toLowerCase();
    const mode = part.slice(colon + 1).toLowerCase();
    hosts[id] = mode;
  }
  return hosts;
}

/** Wire statusline for each host entry; mode `skip` → skipped without calling a wirer. */
export function wireAllStatusline({ home, marketplaceRoot, hosts, dryRun = false }) {
  const results = [];

  for (const [id, mode] of Object.entries(hosts)) {
    const wirer = WIRERS[id];
    if (!wirer) {
      results.push({ id, ok: false, detail: `unknown host: ${id}` });
      continue;
    }

    if (mode === "skip") {
      results.push({ id, ok: true, skipped: true, detail: "skipped" });
      continue;
    }

    try {
      const r = wirer({ home, marketplaceRoot, mode, dryRun });
      results.push({ id, ...r });
    } catch (e) {
      results.push({ id, ok: false, detail: e.message });
    }
  }

  return { results };
}

function parseCli(argv) {
  let marketplaceRoot;
  let hostsSpec;
  let home = os.homedir();
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--marketplace") {
      marketplaceRoot = argv[++i];
      continue;
    }
    if (arg === "--hosts") {
      hostsSpec = argv[++i];
      continue;
    }
    if (arg === "--home") {
      home = argv[++i];
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!marketplaceRoot) {
    throw new Error("usage: wire-all.mjs --marketplace <dir> --hosts claude:replace,... [--home DIR] [--dry-run]");
  }
  if (!hostsSpec) {
    throw new Error("usage: wire-all.mjs --marketplace <dir> --hosts claude:replace,... [--home DIR] [--dry-run]");
  }

  return { home, marketplaceRoot, hosts: parseHostsArg(hostsSpec), dryRun };
}

function defaultMarketplaceRoot() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) return path.join(pluginRoot, "..");
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function isSuccessResult(r) {
  return r.ok || r.unsupported || r.skipped;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const opts = parseCli(process.argv.slice(2));
    const r = wireAllStatusline(opts);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.results.every(isSuccessResult) ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}

export { defaultMarketplaceRoot };
