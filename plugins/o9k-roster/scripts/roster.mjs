#!/usr/bin/env node
// roster.mjs — deterministic model selection for multi-agent delegation.
//
// Subcommands: init | pick | usage | mark-limited | dispatch | handoff.
// Selection walks a role's fallback chain (CLI×model cells: "cli:model",
// {cli,model}, or bare model id) and skips entries whose provider usage is
// at/over limits.handoff_at or which carry an unexpired mark-limited entry
// on the model, provider, or CLI. All state lives in ~/.o9k/{roster,usage}.json
// (override via O9K_ROSTER / O9K_USAGE for tests). Zero dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { linkDispatchToRun } from "./runs.mjs";
import {
  modelUsageGate,
  windowIsBlocking,
  effectiveResetAt,
  windowAppliesToCli,
} from "./usage-windows.mjs";

/** First non-flag argv token; skips values that belong to --flags. */
export function firstPositional(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) i++;
      continue;
    }
    return a;
  }
  return undefined;
}

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
 * Parse a chain entry into {model, cli|null}.
 * - "model-id"           → { model, cli: null }  (cli resolved from models[m].cli[0])
 * - "cli:model-id"       → { model, cli }
 * - { model, cli? }      → same
 */
export function parseChainEntry(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    if (typeof entry.model !== "string" || !entry.model) {
      throw new Error(`invalid chain entry object: ${JSON.stringify(entry)}`);
    }
    return { model: entry.model, cli: entry.cli ?? null };
  }
  if (typeof entry !== "string" || !entry) {
    throw new Error(`invalid chain entry: ${entry}`);
  }
  const i = entry.indexOf(":");
  if (i === -1) return { model: entry, cli: null };
  const cli = entry.slice(0, i);
  const model = entry.slice(i + 1);
  if (!cli || !model) throw new Error(`invalid chain entry: ${entry}`);
  return { model, cli };
}

function entryLabel(model, cli) {
  return cli ? `${cli}:${model}` : model;
}

/** Resolve usage window keys that gate a model spawn. */
export function resolveLimitWindows(_roster, modelId, model) {
  if (Array.isArray(model?.limit_windows) && model.limit_windows.length) {
    return model.limit_windows;
  }
  const out = [];
  const clis = model?.cli || [];
  if (clis.includes("claude")) {
    out.push("claude:session", "claude:week", "claude:5h");
    if (modelId.includes("fable")) out.push("claude:fable-week");
  }
  if (clis.includes("codex")) out.push("codex:weekly");
  if (clis.includes("cursor")) out.push("cursor:included");
  return out;
}

function hasWindowsData(usage) {
  return Boolean(usage?.windows && Object.keys(usage.windows).length > 0);
}

function dispatchFreshnessMs(roster) {
  return roster?.usage_watcher?.dispatch_freshness_sec ?? 300;
}

/**
 * Walk role's chain, return first viable {model, cli, skipped}. Viability:
 * defined in roster.models, resolved CLI has a template and is listed on the
 * model (when model.cli is set), provider and CLI usage below handoff_at, no
 * unexpired mark on the model / provider / CLI. model:null when exhausted.
 *
 * Chain entries may be bare model ids, "cli:model" pins, or {model, cli?}
 * objects — see parseChainEntry.
 */
export function pick({ roster, usage, role, now = Date.now() }) {
  const spec = roster.roles?.[role];
  if (!spec) throw new Error(`unknown role: ${role}`);
  const { handoff_at } = limits(roster);
  const skipped = [];

  for (const raw of spec.chain) {
    let parsed;
    try {
      parsed = parseChainEntry(raw);
    } catch (e) {
      skipped.push({ model: String(raw), reason: e.message });
      continue;
    }
    const { model: name } = parsed;
    const model = roster.models?.[name];
    if (!model) {
      skipped.push({ model: entryLabel(name, parsed.cli), reason: "not in models" });
      continue;
    }

    const cli = parsed.cli ?? model.cli?.[0] ?? null;
    const label = entryLabel(name, parsed.cli);

    if (!cli) {
      skipped.push({ model: label, reason: "no cli resolved" });
      continue;
    }
    if (!roster.clis?.[cli]?.cmd) {
      skipped.push({ model: label, reason: `no cli template for "${cli}"` });
      continue;
    }
    if (Array.isArray(model.cli) && model.cli.length > 0 && !model.cli.includes(cli)) {
      skipped.push({ model: label, reason: `cli "${cli}" not listed for model` });
      continue;
    }

    const limitWindows = resolveLimitWindows(roster, name, model);
    const gate = modelUsageGate({
      usage,
      limitWindows,
      provider: model.provider,
      cli,
      handoffAt: handoff_at,
      now,
    });
    if (gate.blocked) {
      skipped.push({ model: label, reason: gate.reason });
      continue;
    }
    if (markedUntil(usage, name, now)) {
      skipped.push({ model: label, reason: `marked limited until ${usage.marked[name].until}` });
      continue;
    }
    if (markedUntil(usage, model.provider, now)) {
      skipped.push({ model: label, reason: `provider marked limited until ${usage.marked[model.provider].until}` });
      continue;
    }
    if (markedUntil(usage, cli, now)) {
      skipped.push({ model: label, reason: `cli marked limited until ${usage.marked[cli].until}` });
      continue;
    }
    return { model: name, cli, skipped };
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

/** Providers that gate models spawnable on `cli` (legacy usage.providers path). */
export function providersForCli(roster, cli) {
  const out = new Set();
  for (const m of Object.values(roster?.models || {})) {
    if (m.cli?.includes(cli) && m.provider) out.add(m.provider);
  }
  return out;
}

/** Whether a mark-limited target is actionable in a host-scoped session. */
export function isMarkedRelevantToCli(target, roster, cli) {
  if (!cli) return true;
  if (target === cli) return true;
  const model = roster?.models?.[target];
  if (model?.cli?.includes(cli)) return true;
  for (const m of Object.values(roster?.models || {})) {
    if (m.provider === target && m.cli?.includes(cli)) return true;
  }
  return false;
}

/**
 * Threshold check shared by `usage --check` and limit-watch.mjs.
 * Empty string when all providers are below warn_at.
 * When `cli` is set (limit-watch), only windows/markers for that host CLI apply.
 */
export function checkThresholds({ roster, usage, now = Date.now(), cli = null }) {
  const { warn_at, handoff_at } = limits(roster);
  const lines = [];
  let handoff = false;

  if (hasWindowsData(usage)) {
    for (const [wkey, info] of Object.entries(usage.windows)) {
      if (cli && !windowAppliesToCli(wkey, cli)) continue;
      if (typeof info?.used !== "number") continue;
      const resetAt = effectiveResetAt(info, wkey, handoff_at, now);
      if (resetAt !== null && now >= resetAt) continue;
      const pct = Math.round(info.used * 100);
      if (windowIsBlocking(wkey, usage, handoff_at, now)) {
        lines.push(`⛔ o9k-roster: ${wkey} at ${pct}% — session limit reached.`);
        handoff = true;
      } else if (info.used >= warn_at) {
        lines.push(`⚠️ o9k-roster: ${wkey} at ${pct}% — prepare for handoff: converge to a checkpointable state.`);
      }
    }
  } else if (!cli) {
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
  } else {
    const relevant = providersForCli(roster, cli);
    for (const provider of relevant) {
      const info = usage?.providers?.[provider];
      if (typeof info?.used !== "number") continue;
      const pct = Math.round(info.used * 100);
      if (info.used >= handoff_at) {
        lines.push(`⛔ o9k-roster: ${provider} at ${pct}% — session limit reached.`);
        handoff = true;
      } else if (info.used >= warn_at) {
        lines.push(`⚠️ o9k-roster: ${provider} at ${pct}% — prepare for handoff: converge to a checkpointable state.`);
      }
    }
  }
  for (const [target, mark] of Object.entries(usage?.marked || {})) {
    if (Date.parse(mark.until) > now && isMarkedRelevantToCli(target, roster, cli)) {
      lines.push(`ℹ️ o9k-roster: ${target} marked limited until ${mark.until}${mark.reason ? ` (${mark.reason})` : ""}`);
    }
  }
  if (handoff) {
    const rosterScript = fileURLToPath(import.meta.url);
    lines.push(
      "Do this now: (1) write HANDOFF.md in the working directory (current state, done steps, open steps, verification commands), " +
      `(2) run: node ${rosterScript} handoff --role <your role> --dir "$PWD", ` +
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
  const target = firstPositional(args);
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
  if (args.includes("--refresh")) {
    return cmdUsageRefresh(args);
  }
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
  for (const [wkey, info] of Object.entries(usage.windows || {})) {
    console.log(`${wkey}: ${Math.round((info.used ?? 0) * 100)}%${info.updated ? ` (as of ${info.updated})` : ""}`);
  }
  for (const [p, info] of Object.entries(usage.providers || {})) {
    console.log(`${p}: ${Math.round((info.used ?? 0) * 100)}%${info.updated ? ` (as of ${info.updated})` : ""}`);
  }
  for (const [t, m] of Object.entries(usage.marked || {})) {
    console.log(`marked ${t}: until ${m.until}${m.reason ? ` (${m.reason})` : ""}`);
  }
}

async function cmdUsageRefresh(args) {
  const { collectUsage } = await import("./usage-collect.mjs");
  const cli = argValue(args, "--cli");
  const roster = requireRoster();
  const results = await collectUsage({ clis: cli ? [cli] : undefined, roster });
  for (const r of results) {
    if (r.ok) console.log(`refreshed ${r.cli}: ${Object.keys(r.windows).join(", ")}`);
    else console.log(`skip ${r.cli}: ${r.reason}`);
  }
  if (!results.some((r) => r.ok)) process.exit(1);
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

function modelUsageBlocked({ roster, usage, modelName, cli, handoffAt, now }) {
  const model = roster.models?.[modelName];
  if (!model) return false;
  return modelUsageGate({
    usage,
    limitWindows: resolveLimitWindows(roster, modelName, model),
    provider: model.provider,
    cli,
    handoffAt,
    now,
  }).blocked;
}

/**
 * Re-pick after a successful pre-dispatch collect. Pins the prior pick when the
 * collect probe alone pushed usage over handoff (pre-clear, post-blocked).
 */
export function resolvePickAfterRefresh({
  roster,
  preUsage,
  postUsage,
  priorPick,
  role,
  now = Date.now(),
}) {
  const { handoff_at } = limits(roster);
  const r2 = pick({ roster, usage: postUsage, role, now });
  if (r2.model) return r2;
  if (
    priorPick.model &&
    !modelUsageBlocked({
      roster,
      usage: preUsage,
      modelName: priorPick.model,
      cli: priorPick.cli,
      handoffAt: handoff_at,
      now,
    }) &&
    modelUsageBlocked({
      roster,
      usage: postUsage,
      modelName: priorPick.model,
      cli: priorPick.cli,
      handoffAt: handoff_at,
      now,
    })
  ) {
    return priorPick;
  }
  return { model: null, cli: null, skipped: r2.skipped };
}

async function spawnInTmux({ roster, role, dir, prompt, runId }) {
  const now = Date.now();
  let usage = loadJson(usagePath());
  let r = pick({ roster, usage, role, now });
  for (const s of r.skipped) console.log(`skipped ${s.model}: ${s.reason}`);
  if (!r.model) {
    console.error(`chain exhausted for role ${role} — no viable model`);
    process.exit(2);
  }
  const priorPick = { model: r.model, cli: r.cli, skipped: r.skipped };
  try {
    const { isSubscriptionCli, collectUsageForCli } = await import("./usage-collect.mjs");
    const { isCliUsageFresh } = await import("./usage-windows.mjs");
    if (
      isSubscriptionCli(r.cli, roster) &&
      !isCliUsageFresh(r.cli, usage, dispatchFreshnessMs(roster) * 1000, now)
    ) {
      const refreshed = await collectUsageForCli({ cli: r.cli, roster });
      if (refreshed.ok) {
        const preUsage = usage;
        usage = loadJson(usagePath());
        r = resolvePickAfterRefresh({
          roster,
          preUsage,
          postUsage: usage,
          priorPick,
          role,
          now,
        });
        for (const s of r.skipped) console.log(`skipped ${s.model}: ${s.reason}`);
        if (!r.model) {
          console.error(`chain exhausted for role ${role} after usage refresh`);
          process.exit(2);
        }
      }
    }
  } catch {
    // stale cache — proceed with pick above
  }
  const argv = buildCommand({ roster, model: r.model, cli: r.cli, prompt });
  const session = `o9k-${role}-${Date.now().toString(36)}`;
  execFileSync("tmux", tmuxArgs({ session, dir, argv }), { stdio: "inherit" });
  linkDispatchToRun(runId, session);
  console.log(`model: ${r.model} (${r.cli})`);
  console.log(`tmux session: ${session}`);
  console.log(`attach: tmux attach -t ${session}`);
}

async function cmdDispatch(args) {
  const role = argValue(args, "--role");
  const promptFile = argValue(args, "--prompt-file");
  const dir = argValue(args, "--dir") || process.cwd();
  const runId = argValue(args, "--run-id");
  if (!role || !promptFile) {
    console.error("usage: roster.mjs dispatch --role <role> --prompt-file <file> [--dir <taskdir>] [--run-id <id>]");
    process.exit(1);
  }
  const prompt = fs.readFileSync(promptFile, "utf8").trim();
  await spawnInTmux({ roster: requireRoster(), role, dir, prompt, runId });
}

async function cmdHandoff(args) {
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
  await spawnInTmux({
    roster: requireRoster(),
    role,
    dir,
    prompt: "Read HANDOFF.md in this directory and continue the task it describes.",
  });
}

function printProposalReport(proposals) {
  console.log(`== roster scores report (${proposals.at}) ==`);
  console.log(`applied: ${proposals.applied.length}`);
  for (const a of proposals.applied) {
    console.log(
      `  APPLY ${a.role}: ${a.current ? `${a.current.cli}:${a.current.model} (${a.current.score})` : "(empty)"} → ${a.entry} (${a.proposed.score}, blended=${a.proposed.blended})`
    );
  }
  console.log(`skipped: ${proposals.skipped.length}`);
  for (const s of proposals.skipped) {
    console.log(`  SKIP  ${s.role}: ${s.reason}`);
  }
}

function backupRoster(rosterFile) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${rosterFile}.bak-${stamp}`;
  fs.copyFileSync(rosterFile, bak);
  console.log(`backup: ${bak}`);
  return bak;
}

async function cmdRefresh(args) {
  const { collectScores, buildRoleScores, writeScores } =
    await import("./scores.mjs");
  const { proposeRoleChanges, applyProposals } = await import("./propose.mjs");

  const fixtureDir = argValue(args, "--fixture-dir");
  const doApply = args.includes("--apply");
  let collected;
  try {
    collected = await collectScores({
      fixtureDir: fixtureDir || undefined,
    });
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }

  const roster = loadJson(configPath());
  collected.role_scores = buildRoleScores(collected, roster || { clis: {} });
  const dest = writeScores(collected);
  console.log(`scores written: ${dest}`);

  if (!roster) {
    console.log("no roster.json — scores only (run init + curate before apply)");
    return;
  }

  const proposals = proposeRoleChanges({ roster, scoresFile: collected });
  printProposalReport(proposals);

  if (doApply && proposals.applied.length) {
    backupRoster(configPath());
    const next = applyProposals({ roster, scoresFile: collected, proposals });
    fs.writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`);
    console.log(`roster updated: ${configPath()}`);
  } else if (doApply) {
    console.log("nothing to auto-apply");
  } else {
    console.log("hint: re-run with --apply for semiauto chain updates");
  }
}

async function cmdPropose() {
  const { loadScores } = await import("./scores.mjs");
  const { proposeRoleChanges } = await import("./propose.mjs");
  const roster = requireRoster();
  const scoresFile = loadScores();
  if (!scoresFile) {
    console.error(`no scores at scores path — run: roster.mjs refresh`);
    process.exit(1);
  }
  printProposalReport(proposeRoleChanges({ roster, scoresFile }));
}

async function cmdApplyScores() {
  const { loadScores } = await import("./scores.mjs");
  const { proposeRoleChanges, applyProposals } = await import("./propose.mjs");
  const roster = requireRoster();
  const scoresFile = loadScores();
  if (!scoresFile) {
    console.error(`no scores — run: roster.mjs refresh`);
    process.exit(1);
  }
  const proposals = proposeRoleChanges({ roster, scoresFile });
  printProposalReport(proposals);
  if (!proposals.applied.length) {
    console.log("nothing to auto-apply");
    return;
  }
  backupRoster(configPath());
  const next = applyProposals({ roster, scoresFile, proposals });
  fs.writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`);
  console.log(`roster updated: ${configPath()}`);
}

const HANDLERS = {
  init: cmdInit,
  pick: cmdPick,
  "mark-limited": cmdMarkLimited,
  usage: cmdUsage,
  dispatch: cmdDispatch,
  handoff: cmdHandoff,
  refresh: cmdRefresh,
  propose: cmdPropose,
  "apply-scores": cmdApplyScores,
};

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const handler = HANDLERS[cmd];
  if (!handler) {
    console.error(`usage: roster.mjs <${Object.keys(HANDLERS).join("|")}> [options]`);
    process.exit(1);
  }
  await handler(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
