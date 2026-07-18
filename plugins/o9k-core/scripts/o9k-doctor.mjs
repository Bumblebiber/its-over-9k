#!/usr/bin/env node
// o9k-doctor.mjs — read-only inventory of every artifact o9k wrote outside
// the marketplace clone, flagging dangling symlinks and stale baked paths
// (e.g. after the marketplace clone moved). Changes nothing; the fix for
// stale wiring is --refresh-hosts, the fix for leftovers is o9k-uninstall.
//
// Usage: o9k-doctor.mjs   (exit 0 = healthy, 1 = problems found)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { detectHosts, readJsonSafe } from "./detect.mjs";
import { skillDrift } from "./skills-sync.mjs";
import { loadConfig } from "./statusline/config.mjs";
import { isO9kStatuslineCommand } from "./statusline/command-path.mjs";
import { isTimStatuslineCommand } from "./statusline/detect-tim.mjs";

function listMatching(dir, re) {
  try {
    return fs.readdirSync(dir).filter((n) => re.test(n)).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

function symlinkState(p) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch {
    return "missing";
  }
  if (!st.isSymbolicLink()) return "foreign";
  try {
    fs.statSync(p); // follows the link
    return "ok";
  } catch {
    return "dangling";
  }
}

/** Baked absolute path from a wrapper/adapter file, or null. */
function bakedRoot(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const m =
      text.match(/O9K_MARKETPLACE_ROOT="([^"]+)"/) ||
      text.match(/const MARKETPLACE = "([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Claude/Cursor statusLine.command check: foreign (present, not ours) is
 * always a problem when statusline is enabled; missing is only a problem
 * on hosts the user's config says should be wired.
 */
function checkStatuslineCommandHost({ hostId, settingsPath, wireHosts, artifacts, problems }) {
  const existing = readJsonSafe(settingsPath);
  const cmd = existing?.statusLine?.command;
  if (isO9kStatuslineCommand(cmd)) {
    artifacts.push({ kind: "statusline", host: hostId, path: settingsPath, state: "ok" });
    return;
  }
  if (isTimStatuslineCommand(cmd)) {
    artifacts.push({ kind: "statusline", host: hostId, path: settingsPath, state: "tim" });
    if (wireHosts?.[hostId]) {
      problems.push(
        `TIM statusline still wired on ${hostId}; re-run /o9k-init migrate or remove manually: ${settingsPath}`
      );
    }
    return;
  }
  if (cmd) {
    artifacts.push({ kind: "statusline", host: hostId, path: settingsPath, state: "foreign" });
    problems.push(`foreign statusLine command on ${hostId} (o9k statusline enabled): ${settingsPath}`);
    return;
  }
  if (wireHosts?.[hostId]) {
    artifacts.push({ kind: "statusline", host: hostId, path: settingsPath, state: "missing" });
    problems.push(
      `statusline enabled and ${hostId} should be wired but no o9k statusLine command found: ${settingsPath}`
    );
  }
}

/** Hermes has no statusLine API — presence is judged by cli.py patches and hook scripts. */
function checkStatuslineHermes({ home, wireHosts, artifacts, problems }) {
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  const timScript = path.join(home, ".hermes/agent-hooks/tim-hermes-statusline.sh");
  let source = "";
  try {
    source = fs.readFileSync(cliPath, "utf8");
  } catch {
    // missing cli.py also counts as not-wired
  }
  const hasTim = source.includes("_get_tim_status") || fs.existsSync(timScript);
  const hasO9k = source.includes("_get_o9k_status");

  if (hasTim && hasO9k) {
    artifacts.push({ kind: "statusline", host: "hermes", path: cliPath, state: "stacked" });
    problems.push(
      `TIM+o9k Hermes statusline stacked; re-run /o9k-init Action A or remove TIM patch: ${cliPath}`
    );
    return;
  }

  if (!wireHosts?.hermes) return;

  const state = hasO9k ? "ok" : hasTim ? "tim" : "missing";
  artifacts.push({ kind: "statusline", host: "hermes", path: cliPath, state });
  if (hasTim && !hasO9k) {
    problems.push(
      `TIM statusline still wired on hermes; re-run /o9k-init migrate or remove manually: ${cliPath}`
    );
  }
  if (!hasO9k) {
    problems.push(
      `statusline enabled and hermes should be wired but cli.py lacks _get_o9k_status: ${cliPath}`
    );
  }
}

/**
 * @param {{ home?: string, pathEnv?: string }} [options]
 * @returns {{ artifacts: object[], problems: string[], drift: object }}
 */
export function doctor(options = {}) {
  const home = options.home ?? os.homedir();
  const artifacts = [];
  const problems = [];

  const detectOpts = { home };
  if (options.pathEnv !== undefined) detectOpts.pathEnv = options.pathEnv;
  const hosts = detectHosts(detectOpts);

  const canonical = path.join(home, ".agents/skills/o9k");
  const canonicalExists = fs.existsSync(canonical);
  artifacts.push({ kind: "canonical", path: canonical, state: canonicalExists ? "ok" : "missing" });

  for (const host of Object.values(hosts)) {
    if (host.skillDir) {
      for (const p of listMatching(host.skillDir, /^o9k-/)) {
        const state = symlinkState(p);
        artifacts.push({ kind: "skill-link", host: host.id, path: p, state });
        if (state === "dangling") problems.push(`dangling skill symlink: ${p}`);
      }
    }
    if (host.rulesDir) {
      for (const p of listMatching(host.rulesDir, /^o9k-.*\.mdc$/)) {
        artifacts.push({ kind: "cursor-rule", host: host.id, path: p, state: "ok" });
        if (!canonicalExists) problems.push(`rule references missing canonical skills: ${p}`);
      }
    }
  }

  for (const dir of [
    path.join(home, ".codex/hooks"),
    path.join(home, ".cursor/hooks"),
    path.join(home, ".hermes/agent-hooks"),
  ]) {
    for (const p of listMatching(dir, /^o9k-.*\.sh$/)) {
      const root = bakedRoot(p);
      const stale = root !== null && !fs.existsSync(root);
      artifacts.push({ kind: "hook-wrapper", path: p, state: stale ? "stale" : "ok", bakedRoot: root });
      if (stale) problems.push(`wrapper bakes missing marketplace path (${root}): ${p}`);
    }
  }

  const opencodePlugin = path.join(home, ".config/opencode/plugins/o9k.ts");
  if (fs.existsSync(opencodePlugin)) {
    const root = bakedRoot(opencodePlugin);
    const stale = root !== null && !fs.existsSync(root);
    artifacts.push({ kind: "opencode-plugin", path: opencodePlugin, state: stale ? "stale" : "ok", bakedRoot: root });
    if (stale) problems.push(`opencode plugin bakes missing marketplace path (${root}): ${opencodePlugin}`);
  }

  // Statusline is opt-in (see o9k-init); only check when the user actually
  // turned it on. Wiring itself only ever happens via that interview — this
  // just verifies enabled hosts stayed wired and nothing foreign crept in.
  const statuslinePath = process.env.O9K_STATUSLINE || path.join(home, ".o9k/statusline.json");
  const statusline = loadConfig({ path: statuslinePath });
  if (statusline?.enabled) {
    const wireHosts = statusline.hosts || {};
    checkStatuslineCommandHost({
      hostId: "claude",
      settingsPath: path.join(home, ".claude/settings.json"),
      wireHosts,
      artifacts,
      problems,
    });
    checkStatuslineCommandHost({
      hostId: "cursor",
      settingsPath: path.join(home, ".cursor/cli-config.json"),
      wireHosts,
      artifacts,
      problems,
    });
    checkStatuslineHermes({ home, wireHosts, artifacts, problems });
  }

  const drift = skillDrift({ home });
  if (!drift.ok) {
    problems.push(
      "skills out of sync with marketplace (run --refresh-hosts): " +
        [
          drift.newPillars?.length ? `new pillars ${drift.newPillars.join(",")}` : "",
          drift.missingCanonical?.length ? `missing canonical ${drift.missingCanonical.join(",")}` : "",
          drift.missingLinks?.length ? `${drift.missingLinks.length} missing links` : "",
        ]
          .filter(Boolean)
          .join("; ")
    );
  }

  return { artifacts, problems, drift };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = doctor();
  console.log("== o9k doctor ==");
  for (const a of r.artifacts) {
    const host = a.host ? ` [${a.host}]` : "";
    console.log(`  ${a.kind.padEnd(16)} ${a.state.padEnd(9)}${host} ${a.path}`);
  }
  if (!r.artifacts.length) console.log("  no o9k artifacts found.");
  console.log("");
  if (r.problems.length) {
    console.log("Problems:");
    for (const p of r.problems) console.log(`  ! ${p}`);
    console.log("");
    console.log("Fixes: stale/missing wiring → update-check.mjs --refresh-hosts;");
    console.log("       leftovers after removal → o9k-uninstall.mjs --dry-run;");
    console.log("       statusline foreign/missing → re-run the /o9k-init statusline step");
    process.exit(1);
  }
  console.log("Healthy: no dangling links, no stale baked paths, skills in sync.");
}
