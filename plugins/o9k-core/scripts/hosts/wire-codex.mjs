import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeHooksJson } from "../hook-merge.mjs";

const HOOK_WRAPPERS = [
  { name: "o9k-core-session", target: "core/session-start" },
  { name: "o9k-memory-session", target: "memory/session-start" },
  { name: "o9k-update-check", target: "core/update-check" },
  { name: "o9k-memory-precompact", target: "memory/pre-compact" },
];

const PRECOMPACT_NOTE =
  "PreCompact hook included for parity; Codex may reject it at runtime (verify in Task 9).";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

function buildWrapperScript({ marketplaceRoot, runHookPath, target }) {
  const root = marketplaceRoot.replace(/"/g, '\\"');
  const runner = runHookPath.replace(/"/g, '\\"');
  return `#!/usr/bin/env bash
export O9K_MARKETPLACE_ROOT="${root}"
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

function installWrapper({ hooksDir, name, content, dryRun }) {
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

function buildCodexHooksPatch(home) {
  const hooksDir = path.join(home, ".codex/hooks");
  const cmd = (script) => `bash ${path.join(hooksDir, script)}`;

  return {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            { type: "command", command: cmd("o9k-core-session.sh"), timeout: 15 },
            { type: "command", command: cmd("o9k-memory-session.sh"), timeout: 15 },
            { type: "command", command: cmd("o9k-update-check.sh"), timeout: 20 },
          ],
        },
      ],
      PreCompact: [
        {
          matcher: "",
          hooks: [{ type: "command", command: cmd("o9k-memory-precompact.sh"), timeout: 30 }],
        },
      ],
    },
  };
}

/**
 * Wire o9k hooks into Codex ~/.codex/hooks.json and install wrapper scripts.
 */
export function wireCodex({ home, marketplaceRoot, dryRun = false }) {
  const hooksDir = path.join(home, ".codex/hooks");
  const hooksJsonPath = path.join(home, ".codex/hooks.json");
  const pluginRoot = fileURLToPath(new URL("../..", import.meta.url));
  const resolvedMarketplace = marketplaceRoot ?? path.join(pluginRoot, "..");
  const runHookPath = path.join(resolvedMarketplace, "o9k-core/hooks/adapters/run-o9k-hook.sh");

  if (!fs.existsSync(runHookPath)) {
    return { ok: false, detail: `missing run-o9k-hook.sh: ${runHookPath}` };
  }

  const installed = [];
  for (const { name, target } of HOOK_WRAPPERS) {
    const content = buildWrapperScript({
      marketplaceRoot: resolvedMarketplace,
      runHookPath,
      target,
    });
    if (installWrapper({ hooksDir, name, content, dryRun })) installed.push(name);
  }

  const existing = readJson(hooksJsonPath);
  const patch = buildCodexHooksPatch(home);
  const merged = mergeHooksJson(existing, patch);

  if (!dryRun) {
    fs.mkdirSync(path.dirname(hooksJsonPath), { recursive: true });
    fs.writeFileSync(hooksJsonPath, `${JSON.stringify(merged, null, 2)}\n`);
  }

  const parts = [];
  if (installed.length) parts.push(`installed wrappers: ${installed.join(", ")}`);
  parts.push(`merged ${hooksJsonPath}`);
  parts.push(PRECOMPACT_NOTE);
  if (dryRun) parts.unshift("dry-run: no files written");

  return { ok: true, detail: parts.join("; ") };
}
