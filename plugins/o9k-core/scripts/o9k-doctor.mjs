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
import { isO9kStatuslineCommand } from "./statusline/legacy-cleanup.mjs";

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
 * Claude/Cursor statusLine.command inventory.
 *
 * o9k no longer wires the statusline (see docs/STATUSLINE.md), so a missing
 * command is never a problem — the user simply hasn't added the snippet, or
 * doesn't want one. What we still report is an o9k-owned command left over
 * from o9k ≤ 0.10.x, because that one points at a path inside the
 * marketplace clone and breaks silently if the clone moves.
 */
function checkStatuslineCommandHost({ hostId, settingsPath, artifacts, problems }) {
  const existing = readJsonSafe(settingsPath);
  const cmd = existing?.statusLine?.command;
  if (!isO9kStatuslineCommand(cmd)) return;

  artifacts.push({ kind: "statusline", host: hostId, path: settingsPath, state: "legacy" });
  const script = cmd.split(/\s+/).find((t) => t.includes("o9k-statusline"));
  if (script && !fs.existsSync(script)) {
    problems.push(
      `statusLine on ${hostId} points at a missing o9k script (${script}) — ` +
        `re-point it at your clone or remove it: ${settingsPath}`
    );
  }
}

/** Hermes has no statusLine API — older o9k versions patched cli.py instead. */
function checkStatuslineHermes({ home, artifacts, problems }) {
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  let patched = false;
  try {
    patched = fs.readFileSync(cliPath, "utf8").includes("_get_o9k_status");
  } catch {
    return; // no cli.py, nothing to report
  }
  if (!patched) return;
  artifacts.push({ kind: "statusline", host: "hermes", path: cliPath, state: "legacy" });
  problems.push(
    `hermes cli.py still carries the o9k statusline patch from an older version — ` +
      `o9k-uninstall.mjs removes it: ${cliPath}`
  );
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

  // Statusline: o9k only ever reports leftovers from versions that still
  // wired it. Deliberately NOT gated on ~/.o9k/statusline.json — a user who
  // disabled or deleted that config still wants to hear about a stale
  // statusLine command sitting in their host config.
  checkStatuslineCommandHost({
    hostId: "claude",
    settingsPath: path.join(home, ".claude/settings.json"),
    artifacts,
    problems,
  });
  checkStatuslineCommandHost({
    hostId: "cursor",
    settingsPath: path.join(home, ".cursor/cli-config.json"),
    artifacts,
    problems,
  });
  checkStatuslineHermes({ home, artifacts, problems });

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
    console.log("       statusline legacy → node o9k-uninstall.mjs removes it (see docs/STATUSLINE.md)");
    process.exit(1);
  }
  console.log("Healthy: no dangling links, no stale baked paths, skills in sync.");
}
