import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the standalone team-up package root.
 * Prefer TEAM_UP_ROOT; else discover the MVP sibling checkout.
 */
export function resolveTeamUpRoot(env = process.env) {
  if (env.TEAM_UP_ROOT) return path.resolve(env.TEAM_UP_ROOT);
  const projects = path.resolve(HERE, "../../../../../../");
  const candidate = path.join(projects, "tasks/task-team-up-mvp/repos/team-up");
  if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  return null;
}

export function resolveTeamUpBin(env = process.env) {
  if (env.TEAM_UP_BIN) return env.TEAM_UP_BIN;
  const root = resolveTeamUpRoot(env);
  if (root) {
    const bin = path.join(root, "bin/team-up.mjs");
    if (fs.existsSync(bin)) return bin;
  }
  // PATH lookup left to caller via bare "team-up"
  return "team-up";
}

/**
 * Map legacy o9k-roster script invocations to team-up CLI argv.
 * @param {"roster"|"runs"|"scores"} surface
 * @param {string[]} args
 */
export function buildTeamUpArgv(surface, args, env = process.env) {
  const bin = resolveTeamUpBin(env);
  if (surface === "roster") {
    // roster.mjs pick|dispatch|... → team-up pick|dispatch|...
    return [bin, ...args];
  }
  if (surface === "runs") {
    return [bin, "runs", ...args];
  }
  if (surface === "scores") {
    // scores helpers map under refresh/propose surfaces
    return [bin, ...args];
  }
  throw new Error(`unknown team-up adapter surface: ${surface}`);
}

export function missingTeamUpMessage(env = process.env) {
  return [
    "team-up binary not found.",
    "Install/configure the standalone team-up engine, then set TEAM_UP_BIN",
    "to its bin/team-up.mjs (or put `team-up` on PATH). Migration: copy or",
    "import ~/.o9k/{roster,usage}.json into ~/.team-up/.",
  ].join(" ");
}

export function assertTeamUpAvailable(env = process.env) {
  const bin = resolveTeamUpBin(env);
  if (bin !== "team-up" && fs.existsSync(bin)) return bin;
  if (bin === "team-up") {
    const which = spawnSync("which", ["team-up"], { encoding: "utf8" });
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
  // argv[0] is bin; rest are args. When bin is node script, invoke via node.
  const cmd = argv[0].endsWith(".mjs") ? process.execPath : argv[0];
  const cmdArgs = argv[0].endsWith(".mjs") ? argv : argv.slice(1);
  const r = spawn(cmd, cmdArgs, { stdio, env: { ...env, TEAM_UP_BIN: bin } });
  return r.status ?? 1;
}
