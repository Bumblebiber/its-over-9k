#!/usr/bin/env node
// update-check.mjs — o9k dependency update checker.
//
// Checks the installed o9k pillars and companion frameworks for newer versions
// and either tells the agent what's updatable or (opt-in) applies the safe
// updates automatically.
//
// Config (env):
//   O9K_UPDATE_CHECK          off | notify (default) | auto
//     off    — never check.
//     notify — check (cached) and report what is updatable; apply nothing.
//     auto   — additionally apply SAFE updates automatically (npm-global CLIs
//              only; plugins and git tools are always notify-only, never
//              clobbered).
//   O9K_UPDATE_INTERVAL_HOURS min hours between network checks (default 24).
//
// Modes (argv):
//   (none)     hook mode — read cache, report instantly, spawn a detached
//              background refresh when the cache is stale. Never blocks session
//              start on the network.
//   --refresh  internal background pass — do the network checks, write cache,
//              apply auto-updates if configured. No stdout.
//   --report         force a fresh check now; print a human-readable status. Read-only.
//   --apply          force a fresh check now; apply safe npm updates; then refresh
//                    multi-CLI skills+hooks (idempotent host-wire / skills-sync).
//   --refresh-hosts  only re-sync skills + re-wire host hooks (after marketplace
//                    update). No npm checks.
//
// Zero dependencies. Every probe degrades to "unknown" instead of throwing.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectPillars, detectCompanions } from "./detect.mjs";
import { refreshHosts } from "./refresh-hosts.mjs";
import { skillDrift } from "./skills-sync.mjs";

const CACHE = path.join(os.homedir(), ".claude", "o9k-update-cache.json");
const MODE = (process.env.O9K_UPDATE_CHECK || "notify").toLowerCase();
const INTERVAL_MS =
  (Number(process.env.O9K_UPDATE_INTERVAL_HOURS) || 24) * 3600 * 1000;

const flag = process.argv[2] || "";

// npm-global CLIs we can check and safely auto-update. Key = detect.mjs field.
const NPM_TARGETS = {
  hmem: "hmem-mcp",
  astGrep: "@ast-grep/cli",
  ccusage: "ccusage",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function run(cmd, args, timeout = 20_000) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout,
    }).trim();
  } catch {
    return "";
  }
}

function has(bin) {
  return !!run(process.platform === "win32" ? "where" : "which", [bin], 4000);
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(obj) {
  try {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(obj, null, 2));
  } catch {
    /* best-effort */
  }
}

/** newer(a,b): is version a strictly greater than b? Lenient numeric compare;
 *  non-numeric/prerelease segments stop the comparison (treated as not-newer). */
function newer(a, b) {
  const pa = String(a).replace(/^v/, "").split(/[.\-+]/);
  const pb = String(b).replace(/^v/, "").split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = parseInt(pa[i] ?? "0", 10);
    const nb = parseInt(pb[i] ?? "0", 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) return false;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

function npmInstalledVersion(pkg) {
  const out = run("npm", ["ls", "-g", pkg, "--json", "--depth=0"], 20_000);
  if (!out) return null;
  try {
    return JSON.parse(out)?.dependencies?.[pkg]?.version ?? null;
  } catch {
    return null;
  }
}

function npmLatestVersion(pkg) {
  return run("npm", ["view", pkg, "version"], 20_000) || null;
}

/** The o9k marketplace repo: is the local clone behind its upstream? */
function o9kRepoStatus() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
  if (!pluginRoot) return null;
  const root = path.resolve(pluginRoot, "..", "..");
  if (!fs.existsSync(path.join(root, ".git"))) return null;
  const upstream = run("git", ["-C", root, "rev-parse", "--abbrev-ref", "@{u}"], 8000);
  if (!upstream) return null; // no tracking branch
  run("git", ["-C", root, "fetch", "--quiet", "--no-tags"], 15_000);
  const behind = run("git", ["-C", root, "rev-list", "--count", "HEAD..@{u}"], 8000);
  const n = parseInt(behind, 10);
  if (Number.isNaN(n)) return null;
  return { behind: n, upstream, root };
}

// ---------------------------------------------------------------------------
// the network check (writes cache). Returns the fresh cache object.
// ---------------------------------------------------------------------------
function performCheck(apply) {
  const comp = detectCompanions();
  const npmOk = has("npm");
  const npm = {};

  if (npmOk) {
    for (const [key, pkg] of Object.entries(NPM_TARGETS)) {
      if (!comp[key]) continue;
      const installed = npmInstalledVersion(pkg);
      const latest = npmLatestVersion(pkg);
      const updatable = !!(installed && latest && newer(latest, installed));
      npm[pkg] = { installed, latest, updatable, applied: false };
    }
  }

  // Apply safe updates (npm globals only) when asked.
  const doApply = apply || MODE === "auto";
  if (doApply && npmOk) {
    for (const [pkg, info] of Object.entries(npm)) {
      if (!info.updatable) continue;
      const res = run("npm", ["install", "-g", `${pkg}@latest`], 180_000);
      const after = npmInstalledVersion(pkg);
      info.applied = !!after && !newer(info.latest, after);
      info.installed = after || info.installed;
      info.updatable = !!(after && info.latest && newer(info.latest, after));
      void res;
    }
  }

  const drift = skillDrift();
  const cache = {
    checkedAt: new Date().toISOString(),
    mode: MODE,
    npm,
    o9kRepo: o9kRepoStatus(), // notify-only; never auto-pulled
    npmAvailable: npmOk,
    skills: drift,
  };
  writeCache(cache);
  return cache;
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------
function updatablePkgs(cache) {
  return Object.entries(cache?.npm || {}).filter(([, i]) => i.updatable);
}
function appliedPkgs(cache) {
  return Object.entries(cache?.npm || {}).filter(([, i]) => i.applied);
}

function hookDirective(cache) {
  const lines = [];
  const applied = appliedPkgs(cache);
  const updatable = updatablePkgs(cache);

  if (MODE === "auto" && applied.length) {
    lines.push(
      "o9k auto-updated: " +
        applied.map(([p, i]) => `${p}→${i.installed}`).join(", ") +
        " (takes effect for the relevant tool now/next launch)."
    );
  }
  if (updatable.length) {
    lines.push(
      "o9k updates available: " +
        updatable.map(([p, i]) => `${p} ${i.installed}→${i.latest}`).join(", ") +
        (MODE === "auto"
          ? " (not auto-applied — could not update automatically; run /o9k-update)."
          : ". Mention once and offer to apply via /o9k-update; don't nag.")
    );
  }
  if (cache?.o9kRepo?.behind > 0) {
    lines.push(
      `o9k itself is ${cache.o9kRepo.behind} commit(s) behind upstream — ` +
        "suggest `/plugin marketplace update o9k`, then " +
        '`node "$CLAUDE_PLUGIN_ROOT/scripts/update-check.mjs" --refresh-hosts` ' +
        "(o9k plugins are never auto-updated)."
    );
  }
  if (cache?.skills && !cache.skills.ok) {
    lines.push(
      "o9k skills need refresh — run /o9k-update for details."
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// mode dispatch
// ---------------------------------------------------------------------------
if (MODE === "off") process.exit(0);

if (flag === "--refresh") {
  // Background pass: do the work, write cache, stay silent.
  performCheck(false);
  process.exit(0);
}

if (flag === "--refresh-hosts") {
  // After `/plugin marketplace update o9k` (or a git pull of the marketplace
  // clone): re-copy skills and re-bake host wrappers so non-Claude CLIs pick
  // up the new plugin scripts. Idempotent.
  const dry = process.argv.includes("--dry-run");
  const out = refreshHosts({ dryRun: dry });
  console.log("== o9k host refresh ==");
  console.log(`mode: ${dry ? "dry-run" : "run"}`);
  console.log(
    `skills: linked=${out.skills.linked.length} rules=${out.skills.rules.length}` +
      ` errors=${out.skills.errors.length}`
  );
  for (const e of out.skills.errors) console.log(`  ! ${e}`);
  for (const row of out.hooks.results) {
    console.log(`  ${row.id.padEnd(12)} ${row.ok ? "ok" : "FAIL"}  ${row.detail}`);
  }
  const failed =
    out.hooks.results.some((x) => !x.ok) || out.skills.errors.length > 0;
  process.exit(failed ? 1 : 0);
}

if (flag === "--report" || flag === "--apply") {
  const cache = performCheck(flag === "--apply");
  const upd = updatablePkgs(cache);
  const app = appliedPkgs(cache);
  console.log("== o9k update check ==");
  console.log(`checked: ${cache.checkedAt}   mode: ${MODE}`);
  console.log("");
  if (!cache.npmAvailable) console.log("npm not found — CLI checks skipped.");
  const rows = Object.entries(cache.npm);
  if (rows.length) {
    console.log("npm-global companions:");
    for (const [pkg, i] of rows) {
      const state = i.applied
        ? `updated → ${i.installed}`
        : i.updatable
        ? `UPDATE ${i.installed} → ${i.latest}`
        : `up to date (${i.installed ?? "?"})`;
      console.log(`  ${pkg.padEnd(18)} ${state}`);
    }
  } else {
    console.log("no checkable npm-global companions installed.");
  }
  console.log("");
  if (cache.o9kRepo) {
    console.log(
      cache.o9kRepo.behind > 0
        ? `o9k repo: ${cache.o9kRepo.behind} commit(s) behind — run: /plugin marketplace update o9k` +
            `\n  then: node "$CLAUDE_PLUGIN_ROOT/scripts/update-check.mjs" --refresh-hosts`
        : "o9k repo: up to date."
    );
  }
  if (cache.skills) {
    if (cache.skills.ok) {
      console.log("skills: up to date.");
    } else {
      if (cache.skills.newPillars?.length) {
        console.log(
          `NEW PILLAR: ${cache.skills.newPillars.join(", ")} — skills not wired to any host. Run /o9k-init.`
        );
      }
      if (cache.skills.missingCanonical?.length) {
        console.log(
          `skills missing canonical: ${cache.skills.missingCanonical.join(" ")} — Run: node "$CLAUDE_PLUGIN_ROOT/scripts/update-check.mjs" --refresh-hosts`
        );
      }
      if (cache.skills.missingLinks?.length) {
        const links = cache.skills.missingLinks
          .map((l) => `${l.host}:${l.name}`)
          .join(" ");
        console.log(
          `skills missing links: ${links} — Run: node "$CLAUDE_PLUGIN_ROOT/scripts/update-check.mjs" --refresh-hosts`
        );
      }
    }
  }
  console.log("");
  if (flag === "--report" && upd.length) {
    console.log("To apply the safe (npm-global) updates now:");
    console.log("  node \"$CLAUDE_PLUGIN_ROOT/scripts/update-check.mjs\" --apply");
    console.log("  (or update individually: " +
      upd.map(([p]) => `npm i -g ${p}@latest`).join("  ·  ") + ")");
  }
  if (flag === "--apply") {
    console.log(app.length ? `Applied ${app.length} update(s).` : "Nothing to apply.");
    // Host refresh is opt-in: --apply only touches npm-global CLIs unless
    // explicitly asked to also re-wire host configs (wrappers bake absolute
    // marketplace paths; skills are copies, so a marketplace update can make
    // them stale — but silently rewriting user config files on every
    // --apply is a surprise). Opt in with O9K_REFRESH_HOSTS=on, or run
    // --refresh-hosts separately.
    if ((process.env.O9K_REFRESH_HOSTS || "off").toLowerCase() !== "off") {
      console.log("");
      console.log("Refreshing multi-CLI skills + hooks…");
      try {
        const out = refreshHosts({ dryRun: false });
        console.log(
          `  skills: linked=${out.skills.linked.length} errors=${out.skills.errors.length}`
        );
        for (const row of out.hooks.results) {
          console.log(`  ${row.id.padEnd(12)} ${row.ok ? "ok" : "FAIL"}`);
        }
      } catch (e) {
        console.log(`  host refresh failed: ${e.message}`);
      }
    }
  }
  if (flag === "--report") {
    console.log(
      "After any o9k marketplace/plugin update, refresh non-Claude hosts:"
    );
    console.log(
      '  node "$CLAUDE_PLUGIN_ROOT/scripts/update-check.mjs" --refresh-hosts'
    );
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// hook mode (default): instant report from cache; refresh in background if stale
// ---------------------------------------------------------------------------
{
  const cache = readCache();
  const stale =
    !cache || Date.now() - new Date(cache.checkedAt).getTime() > INTERVAL_MS;

  if (stale) {
    try {
      const child = spawn(process.execPath, [process.argv[1], "--refresh"], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();
    } catch {
      /* background refresh is best-effort */
    }
  }

  const directive = cache ? hookDirective(cache) : "";
  if (!directive) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: directive,
      },
    })
  );
}
