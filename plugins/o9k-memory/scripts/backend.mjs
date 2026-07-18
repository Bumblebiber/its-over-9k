// backend.mjs — shared memory-backend detection for o9k-memory hooks.
//
// Resolution order (first hit wins):
//   1. TIM   — `tim` on PATH, or TIM_CLI env pointing at tim-cli's cli.js
//   2. hmem  — `hmem` on PATH
//   3. none
//
// Set O9K_MEMORY_HOOK=off to disable both o9k-memory hooks entirely
// (e.g. when the backend's own hooks already handle the lifecycle).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function onPath(bin) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/** @returns {{kind:'tim',run:(args:string[])=>string}|{kind:'hmem',run:(args:string[])=>string}|{kind:'none'}} */
export function detectBackend() {
  if (process.env.O9K_MEMORY_HOOK === "off") return { kind: "none" };

  const timCli = process.env.TIM_CLI;
  if (timCli && fs.existsSync(timCli)) {
    return { kind: "tim", run: (args) => runQuiet("node", [timCli, ...args]) };
  }
  if (onPath("tim")) {
    return { kind: "tim", run: (args) => runQuiet("tim", args) };
  }
  if (onPath("hmem")) {
    return { kind: "hmem", run: (args) => runQuiet("hmem", args) };
  }
  return { kind: "none" };
}

function runQuiet(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      // npm-global CLIs (hmem/tim) are .cmd shims on Windows — spawnable
      // only through a shell since Node's CVE-2024-27980 hardening.
      shell: process.platform === "win32",
    }).trim();
  } catch {
    return "";
  }
}

/** True if the user's own Claude Code settings already wire this backend's
 *  lifecycle hooks — then o9k-memory must stay silent (one owner per concern). */
export function backendHooksAlreadyInstalled(kind) {
  try {
    const settings = fs.readFileSync(
      path.join(os.homedir(), ".claude", "settings.json"),
      "utf8"
    );
    if (kind === "hmem") return /hmem\s+(hook-startup|context-inject)/.test(settings);
    if (kind === "tim") return /tim-claude-session-start|resolve-project/.test(settings);
  } catch {
    /* no settings file — nothing installed */
  }
  return false;
}

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
