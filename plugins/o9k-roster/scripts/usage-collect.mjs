// usage-collect.mjs — subscription usage collectors → ~/.o9k/usage.json

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseClaudeUsage, claudeParseComplete } from "./collectors/parse-claude-usage.mjs";
import { parseCodexStatus } from "./collectors/parse-codex-status.mjs";
import { parseCursorUsage } from "./collectors/parse-cursor-usage.mjs";
import { configPath, loadJson, usagePath } from "./roster.mjs";
import { withPtyLock } from "./usage-pty-lock.mjs";
import { runPtyCollect, COLLECT_ENV } from "./usage-pty.mjs";

const DEFAULT_SUBSCRIPTIONS = ["claude", "codex", "cursor"];

export function mergeUsageWindows(existing, parsed) {
  const base = existing ? structuredClone(existing) : { windows: {}, marked: {} };
  base.windows = base.windows || {};
  base.marked = base.marked || {};
  const now = new Date().toISOString();
  for (const [key, info] of Object.entries(parsed)) {
    if (!info || typeof info.used !== "number") continue;
    base.windows[key] = { ...info, updated: info.updated || now };
  }
  base.updated = now;
  return base;
}

export function writeUsageAtomic(usageObj, dest = usagePath()) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(usageObj, null, 2)}\n`);
  fs.renameSync(tmp, dest);
}

function collectClaudeFast() {
  const text = execFileSync("claude", ["-p", "/usage"], {
    encoding: "utf8",
    env: { ...process.env, ...COLLECT_ENV },
    timeout: 45_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return parseClaudeUsage(text);
}

function collectCliTranscript(cli) {
  if (cli === "claude") {
    let windows = collectClaudeFast();
    if (!claudeParseComplete(windows)) {
      const transcript = runPtyCollect("claude");
      windows = { ...windows, ...parseClaudeUsage(transcript) };
    }
    return windows;
  }
  if (cli === "codex") {
    return parseCodexStatus(runPtyCollect("codex"));
  }
  if (cli === "cursor") {
    return parseCursorUsage(runPtyCollect("cursor"));
  }
  throw new Error(`unknown cli: ${cli}`);
}

/**
 * @param {{ cli: string, roster?: object, dryRun?: boolean }} opts
 */
export async function collectUsageForCli(opts) {
  const { cli, dryRun = false } = opts;
  const lock = await withPtyLock(async () => collectCliTranscript(cli));
  if (!lock.ok) {
    return { cli, ok: false, reason: "pty-lock-contention" };
  }
  const parsed = lock.value;
  if (!parsed || !Object.keys(parsed).length) {
    return { cli, ok: false, reason: "empty-parse" };
  }
  if (!dryRun) {
    const merged = mergeUsageWindows(loadJson(usagePath()), parsed);
    writeUsageAtomic(merged);
  }
  return { cli, ok: true, windows: parsed };
}

export function subscriptionsFromRoster(roster) {
  if (Array.isArray(roster?.subscriptions) && roster.subscriptions.length) {
    return roster.subscriptions;
  }
  return DEFAULT_SUBSCRIPTIONS;
}

/**
 * @param {{ clis?: string[], roster?: object, dryRun?: boolean }} [opts]
 */
export async function collectUsage(opts = {}) {
  const roster = opts.roster || loadJson(configPath()) || {};
  const clis = opts.clis || subscriptionsFromRoster(roster);
  const results = [];
  for (const cli of clis) {
    try {
      results.push(await collectUsageForCli({ cli, roster, dryRun: opts.dryRun }));
    } catch (e) {
      results.push({ cli, ok: false, reason: String(e.message || e) });
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const cli = args.includes("--cli") ? args[args.indexOf("--cli") + 1] : null;
  const all = args.includes("--all");
  const dryRun = args.includes("--dry-run");

  if (!cli && !all) {
    console.error("usage: usage-collect.mjs --cli <claude|codex|cursor> | --all [--dry-run]");
    process.exit(1);
  }

  const roster = loadJson(configPath()) || {};
  const clis = cli ? [cli] : subscriptionsFromRoster(roster);
  const results = await collectUsage({ clis, roster, dryRun });

  for (const r of results) {
    if (r.ok) {
      console.log(`ok ${r.cli}: ${Object.keys(r.windows).join(", ")}`);
    } else {
      console.log(`skip ${r.cli}: ${r.reason}`);
    }
  }
  if (!results.some((r) => r.ok)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
