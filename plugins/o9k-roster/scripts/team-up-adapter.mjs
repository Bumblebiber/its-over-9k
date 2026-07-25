import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Production resolution order:
 * 1. TEAM_UP_BIN (explicit binary)
 * 2. TEAM_UP_ROOT (package root → bin/team-up.mjs)
 * 3. `team-up` on PATH
 * Never hardcode ephemeral task-checkout discovery paths.
 */
export function resolveTeamUpRoot(env = process.env) {
  if (env.TEAM_UP_ROOT) {
    const root = path.resolve(env.TEAM_UP_ROOT);
    if (fs.existsSync(path.join(root, "package.json"))) return root;
  }
  if (env.TEAM_UP_BIN) {
    const bin = path.resolve(env.TEAM_UP_BIN);
    const root = path.dirname(path.dirname(bin));
    if (fs.existsSync(path.join(root, "package.json"))) return root;
  }
  const which = spawnSync("which", ["team-up"], { encoding: "utf8", env });
  if (which.status === 0 && which.stdout.trim()) {
    const bin = fs.realpathSync(which.stdout.trim());
    const root = path.dirname(path.dirname(bin));
    if (fs.existsSync(path.join(root, "package.json"))) return root;
  }
  return null;
}

export function resolveTeamUpBin(env = process.env) {
  if (env.TEAM_UP_BIN) return env.TEAM_UP_BIN;
  if (env.TEAM_UP_ROOT) {
    const bin = path.join(path.resolve(env.TEAM_UP_ROOT), "bin/team-up.mjs");
    if (fs.existsSync(bin)) return bin;
  }
  return "team-up";
}

export function teamUpModuleUrl(rel, env = process.env) {
  const root = resolveTeamUpRoot(env);
  if (!root) {
    throw Object.assign(new Error(missingTeamUpMessage(env)), { code: "TEAM_UP_MISSING" });
  }
  return pathToFileURL(path.join(root, rel)).href;
}

/**
 * Map legacy o9k-roster script invocations to team-up CLI argv.
 * @param {"roster"|"runs"|"scores"} surface
 * @param {string[]} args
 */
export function buildTeamUpArgv(surface, args, env = process.env) {
  const bin = resolveTeamUpBin(env);
  if (surface === "roster") {
    return [bin, ...args];
  }
  if (surface === "runs") {
    return [bin, "runs", ...args];
  }
  if (surface === "scores") {
    return [bin, ...args];
  }
  throw new Error(`unknown team-up adapter surface: ${surface}`);
}

export function missingTeamUpMessage(env = process.env) {
  return [
    "team-up binary not found.",
    "Install/configure the standalone team-up engine, then set TEAM_UP_BIN",
    "to its bin/team-up.mjs (or TEAM_UP_ROOT / put `team-up` on PATH). Migration: copy or",
    "import ~/.o9k/{roster,usage}.json into ~/.team-up/.",
  ].join(" ");
}

export function assertTeamUpAvailable(env = process.env) {
  const bin = resolveTeamUpBin(env);
  if (bin !== "team-up" && fs.existsSync(bin)) return bin;
  if (bin === "team-up") {
    const which = spawnSync("which", ["team-up"], { encoding: "utf8", env });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  const err = new Error(missingTeamUpMessage(env));
  err.code = "TEAM_UP_MISSING";
  throw err;
}

/** CLI forwarder — no roster/usage state I/O in o9k. */
export function runTeamUpCli(surface, args, {
  env = process.env,
  spawn = spawnSync,
  stdio = "inherit",
} = {}) {
  let bin;
  try {
    bin = assertTeamUpAvailable(env);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  const argv = buildTeamUpArgv(surface, args, { ...env, TEAM_UP_BIN: bin });
  const cmd = argv[0].endsWith(".mjs") ? process.execPath : argv[0];
  const cmdArgs = argv[0].endsWith(".mjs") ? argv : argv.slice(1);
  const r = spawn(cmd, cmdArgs, { stdio, env: { ...env, TEAM_UP_BIN: bin } });
  return r.status ?? 1;
}
