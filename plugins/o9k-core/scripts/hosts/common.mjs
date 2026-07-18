// common.mjs — shared helpers for the per-host wire-*.mjs adapters
// (wire-codex, wire-cursor, wire-hermes, wire-opencode). Single source of
// truth for: safe JSON reads, plugin/marketplace root resolution, the
// backup-on-write contract for user config files, and the wrapper-script
// trio (build/match/install) previously copy-pasted across adapters.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** JSON.parse a file; ENOENT -> null; any other error (incl. malformed JSON) rethrows. */
export function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

/** {pluginRoot, marketplaceRoot} for a wire-*.mjs module at scripts/hosts/<file>.mjs. */
export function resolveRoots(moduleUrl, marketplaceRootOverride) {
  const pluginRoot = fileURLToPath(new URL("../..", moduleUrl));
  const marketplaceRoot = path.resolve(marketplaceRootOverride ?? path.join(pluginRoot, ".."));
  return { pluginRoot, marketplaceRoot };
}

/**
 * Write `content` to `filePath`. If a different file already exists there,
 * roll one backup to `${filePath}.o9k-bak` first (single rolling backup, not
 * a history). No-op (no write, no backup) when content is unchanged.
 * Returns true iff the file was written.
 */
export function writeFileWithBackup(filePath, content, opts = {}) {
  let existing = null;
  try {
    existing = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (existing === content) return false;

  if (existing !== null) {
    try {
      fs.copyFileSync(filePath, `${filePath}.o9k-bak`);
    } catch {
      // best-effort backup; never block the write on it
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (opts.mode !== undefined) {
    fs.writeFileSync(filePath, content, { mode: opts.mode });
  } else {
    fs.writeFileSync(filePath, content);
  }
  return true;
}

/** The wrapper scripts every hook-wiring host needs, name/target/timeout. */
export const HOOK_WRAPPERS = [
  { name: "o9k-core-session", target: "core/session-start", timeout: 15 },
  { name: "o9k-memory-session", target: "memory/session-start", timeout: 15 },
  { name: "o9k-update-check", target: "core/update-check", timeout: 20 },
  { name: "o9k-memory-precompact", target: "memory/pre-compact", timeout: 30 },
  { name: "o9k-roster-limit-watch", target: "roster/limit-watch", timeout: 10 },
];

/**
 * Session-start hook targets for hosts that run everything on one event
 * (OpenCode). Derived from HOOK_WRAPPERS so a new hook shows up everywhere;
 * pre-compact is excluded — it wires to the host's compacting event.
 */
export const SESSION_START_TARGETS = HOOK_WRAPPERS.filter(
  (w) => w.target !== "memory/pre-compact"
).map((w) => w.target);

/**
 * Build a wrapper shell script that execs run-o9k-hook.sh for `target`.
 * `guardName`, when set, adds a once-per-Hermes-session marker-file guard
 * (Hermes re-runs pre_llm_call wrappers on every LLM call; other hosts only
 * fire SessionStart once, so they never pass this).
 */
export function buildWrapperScript({ marketplaceRoot, runHookPath, target, guardName }) {
  const root = marketplaceRoot.replace(/"/g, '\\"');
  const runner = runHookPath.replace(/"/g, '\\"');
  const guard = guardName
    ? `MARKER="\${TMPDIR:-/tmp}/o9k-hermes-$PPID-${guardName}"\n[ -f "$MARKER" ] && exit 0\ntouch "$MARKER"\n`
    : "";
  return `#!/usr/bin/env bash
${guard}export O9K_MARKETPLACE_ROOT="${root}"
exec bash "${runner}" ${target}
`;
}

function wrapperContentMatches(filePath, expected) {
  try {
    return fs.readFileSync(filePath, "utf8") === expected;
  } catch {
    return false;
  }
}

/** Install one wrapper script if missing/stale. Returns true iff (would be) written. */
export function installWrapper({ hooksDir, name, content, dryRun }) {
  const dest = path.join(hooksDir, `${name}.sh`);
  if (wrapperContentMatches(dest, content)) return false;

  if (dryRun) return true;

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(dest, content, { mode: 0o755 });
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    // best-effort on platforms that ignore mode in writeFileSync
  }
  return true;
}
