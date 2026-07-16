#!/usr/bin/env node
// roster.mjs — deterministic model selection for multi-agent delegation.
//
// Subcommands: init | pick | usage | mark-limited | dispatch | handoff.
// Selection walks a role's fallback chain and skips models whose provider
// usage is at/over limits.handoff_at or which carry an unexpired
// mark-limited entry. All state lives in ~/.o9k/{roster,usage}.json
// (override via O9K_ROSTER / O9K_USAGE for tests). Zero dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function configPath() {
  return process.env.O9K_ROSTER || path.join(os.homedir(), ".o9k/roster.json");
}

export function usagePath() {
  return process.env.O9K_USAGE || path.join(os.homedir(), ".o9k/usage.json");
}

/** JSON.parse a file; ENOENT -> null; malformed JSON rethrows. */
export function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function limits(roster) {
  return { warn_at: 0.9, handoff_at: 0.95, ...(roster.limits || {}) };
}

function markedUntil(usage, key, now) {
  const until = usage?.marked?.[key]?.until;
  if (!until) return false;
  return Date.parse(until) > now;
}

/**
 * Walk role's chain, return first viable {model, cli, skipped}. Viability:
 * defined in roster.models, provider usage below handoff_at, no unexpired
 * mark on the model or its provider. model:null when the chain is exhausted.
 */
export function pick({ roster, usage, role, now = Date.now() }) {
  const spec = roster.roles?.[role];
  if (!spec) throw new Error(`unknown role: ${role}`);
  const { handoff_at } = limits(roster);
  const skipped = [];

  for (const name of spec.chain) {
    const model = roster.models?.[name];
    if (!model) {
      skipped.push({ model: name, reason: "not in models" });
      continue;
    }
    const used = usage?.providers?.[model.provider]?.used;
    if (typeof used === "number" && used >= handoff_at) {
      skipped.push({ model: name, reason: `provider ${model.provider} at ${Math.round(used * 100)}%` });
      continue;
    }
    if (markedUntil(usage, name, now)) {
      skipped.push({ model: name, reason: `marked limited until ${usage.marked[name].until}` });
      continue;
    }
    if (markedUntil(usage, model.provider, now)) {
      skipped.push({ model: name, reason: `provider marked limited until ${usage.marked[model.provider].until}` });
      continue;
    }
    return { model: name, cli: model.cli?.[0] ?? null, skipped };
  }
  return { model: null, cli: null, skipped };
}

export function parseTtl(str) {
  const m = /^(\d+)([mhd])$/.exec(str || "");
  if (!m) throw new Error(`invalid ttl: ${str} (use e.g. 30m, 5h, 1d)`);
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return Number(m[1]) * unit;
}

/** Pure: returns a new usage object with target marked until now+ttl. */
export function markLimited({ usage, target, ttlMs, now = Date.now(), reason }) {
  const base = usage ? structuredClone(usage) : {};
  base.marked = base.marked || {};
  base.marked[target] = {
    until: new Date(now + ttlMs).toISOString(),
    ...(reason ? { reason } : {}),
  };
  return base;
}

/**
 * Threshold check shared by `usage --check` and limit-watch.mjs.
 * Empty string when all providers are below warn_at.
 */
export function checkThresholds({ roster, usage, now = Date.now() }) {
  const { warn_at, handoff_at } = limits(roster);
  const lines = [];
  let handoff = false;
  for (const [provider, info] of Object.entries(usage?.providers || {})) {
    if (typeof info?.used !== "number") continue;
    const pct = Math.round(info.used * 100);
    if (info.used >= handoff_at) {
      lines.push(`⛔ o9k-roster: ${provider} at ${pct}% — session limit reached.`);
      handoff = true;
    } else if (info.used >= warn_at) {
      lines.push(`⚠️ o9k-roster: ${provider} at ${pct}% — prepare for handoff: converge to a checkpointable state.`);
    }
  }
  for (const [target, mark] of Object.entries(usage?.marked || {})) {
    if (Date.parse(mark.until) > now) {
      lines.push(`ℹ️ o9k-roster: ${target} marked limited until ${mark.until}${mark.reason ? ` (${mark.reason})` : ""}`);
    }
  }
  if (handoff) {
    lines.push(
      "Do this now: (1) write HANDOFF.md in the working directory (current state, done steps, open steps, verification commands), " +
      "(2) run: node <o9k>/plugins/o9k-roster/scripts/roster.mjs handoff --role <your role> --dir \"$PWD\", " +
      "(3) report the printed tmux session + attach command to the user, (4) stop working in this session."
    );
  }
  return lines.join("\n");
}

function requireRoster() {
  const roster = loadJson(configPath());
  if (!roster) {
    console.error(`no roster config at ${configPath()} — run: node roster.mjs init (or /o9k-init)`);
    process.exit(1);
  }
  return roster;
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function cmdInit() {
  const dest = configPath();
  if (fs.existsSync(dest)) {
    console.log(`exists, not touching: ${dest}`);
    return;
  }
  const src = new URL("../roster.example.json", import.meta.url);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`created ${dest} — curate models/roles/chains before first use`);
}

function cmdPick(args) {
  const role = argValue(args, "--role");
  if (!role) {
    console.error("usage: roster.mjs pick --role <role>");
    process.exit(1);
  }
  const roster = requireRoster();
  const usage = loadJson(usagePath());
  const r = pick({ roster, usage, role });
  for (const s of r.skipped) console.log(`skipped ${s.model}: ${s.reason}`);
  if (!r.model) {
    console.error(`chain exhausted for role ${role} — no viable model`);
    process.exit(2);
  }
  console.log(`model: ${r.model}`);
  console.log(`cli: ${r.cli}`);
}

function cmdMarkLimited(args) {
  const target = args.find((a) => !a.startsWith("--"));
  const ttl = argValue(args, "--ttl");
  if (!target || !ttl) {
    console.error("usage: roster.mjs mark-limited <model|provider> --ttl <30m|5h|1d> [--reason txt]");
    process.exit(1);
  }
  const usage = markLimited({
    usage: loadJson(usagePath()),
    target,
    ttlMs: parseTtl(ttl),
    reason: argValue(args, "--reason"),
  });
  fs.mkdirSync(path.dirname(usagePath()), { recursive: true });
  fs.writeFileSync(usagePath(), `${JSON.stringify(usage, null, 2)}\n`);
  console.log(`marked ${target} limited until ${usage.marked[target].until}`);
}

function cmdUsage(args) {
  const roster = requireRoster();
  const usage = loadJson(usagePath());
  if (args.includes("--check")) {
    const out = checkThresholds({ roster, usage });
    if (out) console.log(out);
    return;
  }
  if (!usage) {
    console.log(`no usage data at ${usagePath()} (no known limits — chains run in config order)`);
    return;
  }
  for (const [p, info] of Object.entries(usage.providers || {})) {
    console.log(`${p}: ${Math.round((info.used ?? 0) * 100)}%${info.updated ? ` (as of ${info.updated})` : ""}`);
  }
  for (const [t, m] of Object.entries(usage.marked || {})) {
    console.log(`marked ${t}: until ${m.until}${m.reason ? ` (${m.reason})` : ""}`);
  }
}

export function buildCommand({ roster, model, cli, prompt }) {
  const template = roster.clis?.[cli]?.cmd;
  if (!template) throw new Error(`no cli template for "${cli}" in roster.json clis section`);
  return template.map((part) => part.replaceAll("{model}", model).replaceAll("{prompt}", prompt));
}

function shellQuote(s) {
  return /^[A-Za-z0-9_\-./=]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

/** Pure tmux argv builder — spawn itself stays a one-liner around this. */
export function tmuxArgs({ session, dir, argv }) {
  return ["new-session", "-d", "-s", session, "-c", dir, argv.map(shellQuote).join(" ")];
}

function spawnInTmux({ roster, role, dir, prompt }) {
  const usage = loadJson(usagePath());
  const r = pick({ roster, usage, role });
  for (const s of r.skipped) console.log(`skipped ${s.model}: ${s.reason}`);
  if (!r.model) {
    console.error(`chain exhausted for role ${role} — no viable model`);
    process.exit(2);
  }
  const argv = buildCommand({ roster, model: r.model, cli: r.cli, prompt });
  const session = `o9k-${role}-${Date.now().toString(36)}`;
  execFileSync("tmux", tmuxArgs({ session, dir, argv }), { stdio: "inherit" });
  console.log(`model: ${r.model} (${r.cli})`);
  console.log(`tmux session: ${session}`);
  console.log(`attach: tmux attach -t ${session}`);
}

function cmdDispatch(args) {
  const role = argValue(args, "--role");
  const promptFile = argValue(args, "--prompt-file");
  const dir = argValue(args, "--dir") || process.cwd();
  if (!role || !promptFile) {
    console.error("usage: roster.mjs dispatch --role <role> --prompt-file <file> [--dir <taskdir>]");
    process.exit(1);
  }
  const prompt = fs.readFileSync(promptFile, "utf8").trim();
  spawnInTmux({ roster: requireRoster(), role, dir, prompt });
}

function cmdHandoff(args) {
  const role = argValue(args, "--role");
  const dir = argValue(args, "--dir") || process.cwd();
  if (!role) {
    console.error("usage: roster.mjs handoff --role <role> [--dir <taskdir>]");
    process.exit(1);
  }
  if (!fs.existsSync(path.join(dir, "HANDOFF.md"))) {
    console.error(`no HANDOFF.md in ${dir} — write it first (state, done, open, verification), then re-run`);
    process.exit(1);
  }
  spawnInTmux({
    roster: requireRoster(),
    role,
    dir,
    prompt: "Read HANDOFF.md in this directory and continue the task it describes.",
  });
}

const HANDLERS = {
  init: cmdInit, pick: cmdPick, "mark-limited": cmdMarkLimited,
  usage: cmdUsage, dispatch: cmdDispatch, handoff: cmdHandoff,
};

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const handler = HANDLERS[cmd];
  if (!handler) {
    console.error(`usage: roster.mjs <${Object.keys(HANDLERS).join("|")}> [options]`);
    process.exit(1);
  }
  handler(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
