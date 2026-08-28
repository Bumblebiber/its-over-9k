// usage-watcher.mjs — adaptive process watcher → usage-collect triggers.

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { configPath, loadJson } from "./roster.mjs";
import { countAgentProcesses, watcherStatePath } from "./usage-procs.mjs";
import { subscriptionsFromRoster } from "./usage-collect.mjs";

const DEFAULT_CONFIG = {
  tick_sec: 60,
  intervals: { idle_heartbeat_hours: 24, active_min: 20, busy_min: 8 },
};

export function watcherConfig(roster) {
  return { ...DEFAULT_CONFIG, ...(roster?.usage_watcher || {}) };
}

export function computeState(counts) {
  const sum = counts.claude + counts.codex + counts.cursor;
  if (sum === 0) return "idle";
  if (sum >= 2 || counts.claude > 1 || counts.codex > 1 || counts.cursor > 1) return "busy";
  return "active";
}

function parseIso(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * Pure: which CLIs to collect this tick (does not advance schedule).
 * @returns {{ collect: string[], state: string }}
 */
export function planCollect({
  counts,
  prevCounts,
  state,
  collecting,
  lastCollect,
  nextDue,
  now = Date.now(),
  subscriptions = ["claude", "codex", "cursor"],
}) {
  const collect = new Set();

  for (const cli of subscriptions) {
    if (collecting?.[cli]) continue;
    const prev = prevCounts[cli] ?? 0;
    const cur = counts[cli] ?? 0;
    if (prev === 0 && cur > 0) collect.add(cli);
    if (prev > 0 && cur === 0) collect.add(cli);
  }

  for (const cli of subscriptions) {
    if ((counts[cli] ?? 0) === 0) continue;
    const due = parseIso(nextDue[cli]);
    if (due === null || now >= due) collect.add(cli);
  }

  if (state === "idle") {
    const hbMs = DEFAULT_CONFIG.intervals.idle_heartbeat_hours * 3_600_000;
    for (const cli of subscriptions) {
      if (collecting?.[cli]) continue;
      const t = parseIso(lastCollect[cli]);
      if (t === null || now - t >= hbMs) collect.add(cli);
    }
  }

  return { collect: [...collect], state };
}

/** @deprecated alias */
export function decideCollect(opts) {
  const plan = planCollect(opts);
  const advanced = advanceSchedule({
    successful: plan.collect,
    state: plan.state,
    lastCollect: opts.lastCollect || {},
    nextDue: opts.nextDue || {},
    now: opts.now,
    config: opts.config || DEFAULT_CONFIG,
  });
  return { ...plan, next: advanced };
}

/**
 * Advance last_collect/next_due only for CLIs whose collect succeeded.
 */
export function advanceSchedule({
  successful,
  state,
  lastCollect,
  nextDue,
  now = Date.now(),
  config = DEFAULT_CONFIG,
}) {
  const intervalMin =
    state === "busy" ? config.intervals.busy_min : config.intervals.active_min;
  const hbMs = config.intervals.idle_heartbeat_hours * 3_600_000;
  const next = {
    last_collect: { ...lastCollect },
    next_due: { ...nextDue },
  };

  for (const cli of successful) {
    next.last_collect[cli] = new Date(now).toISOString();
    next.next_due[cli] =
      state === "idle"
        ? new Date(now + hbMs).toISOString()
        : new Date(now + intervalMin * 60_000).toISOString();
  }

  return next;
}

function loadState() {
  return (
    loadJson(watcherStatePath()) || {
      counts: { claude: 0, codex: 0, cursor: 0 },
      prev_counts: { claude: 0, codex: 0, cursor: 0 },
      state: "idle",
      collecting: { claude: false, codex: false, cursor: false },
      last_collect: { claude: null, codex: null, cursor: null },
      next_due: { claude: null, codex: null, cursor: null },
    }
  );
}

function saveState(state) {
  fs.mkdirSync(path.dirname(watcherStatePath()), { recursive: true });
  fs.writeFileSync(watcherStatePath(), `${JSON.stringify(state, null, 2)}\n`);
}

function runCollect(cli) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "usage-collect.mjs");
  execFileSync(process.execPath, [script, "--cli", cli], {
    stdio: "inherit",
    timeout: 120_000,
  });
}

export function tickOnce({ roster, now = Date.now(), dryRun = false } = {}) {
  const cfg = watcherConfig(roster || {});
  const subs = subscriptionsFromRoster(roster || {});
  const stateDoc = loadState();
  const counts = countAgentProcesses();
  const state = computeState(counts);

  const plan = planCollect({
    counts,
    prevCounts: stateDoc.prev_counts || stateDoc.counts,
    state,
    collecting: stateDoc.collecting,
    lastCollect: stateDoc.last_collect || {},
    nextDue: stateDoc.next_due || {},
    now,
    subscriptions: subs,
  });

  const toCollect = [...new Set(plan.collect)].filter((c) => subs.includes(c));
  const successful = [];

  if (!dryRun) {
    for (const cli of toCollect) {
      stateDoc.collecting = { ...stateDoc.collecting, [cli]: true };
      saveState(stateDoc);
      try {
        runCollect(cli);
        successful.push(cli);
      } catch (e) {
        console.error(`collect failed ${cli}:`, e.message || e);
      } finally {
        stateDoc.collecting = { ...stateDoc.collecting, [cli]: false };
      }
    }
    const advanced = advanceSchedule({
      successful,
      state,
      lastCollect: stateDoc.last_collect || {},
      nextDue: stateDoc.next_due || {},
      now,
      config: cfg,
    });
    stateDoc.counts = counts;
    stateDoc.prev_counts = stateDoc.counts;
    stateDoc.state = state;
    stateDoc.last_collect = advanced.last_collect;
    stateDoc.next_due = advanced.next_due;
    saveState(stateDoc);
  }

  return { counts, state, collect: toCollect, successful };
}

async function main() {
  const once = process.argv.includes("--once");
  const dryRun = process.argv.includes("--dry-run");
  const roster = loadJson(configPath()) || {};
  const cfg = watcherConfig(roster);

  if (once) {
    const r = tickOnce({ roster, dryRun });
    console.log(`state=${r.state} counts=${JSON.stringify(r.counts)} collect=${r.collect.join(",") || "(none)"}`);
    return;
  }

  console.log(`o9k usage-watcher tick=${cfg.tick_sec}s`);
  for (;;) {
    try {
      const r = tickOnce({ roster });
      if (r.collect.length) console.log(`collected: ${r.successful.join(", ") || "(none ok)"}`);
    } catch (e) {
      console.error("watcher tick error:", e.message || e);
    }
    await new Promise((res) => setTimeout(res, cfg.tick_sec * 1000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
