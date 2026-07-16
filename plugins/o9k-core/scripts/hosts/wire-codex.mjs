import fs from "node:fs";
import path from "node:path";
import { mergeHooksJson } from "../hook-merge.mjs";
import {
  HOOK_WRAPPERS,
  buildWrapperScript,
  installWrapper,
  readJsonSafe,
  resolveRoots,
  writeFileWithBackup,
} from "./common.mjs";

const PRECOMPACT_NOTE =
  "PreCompact hook included for parity; Codex may reject it at runtime (verify in Task 9).";

function buildCodexHooksPatch(home) {
  const hooksDir = path.join(home, ".codex/hooks");
  const cmd = (script) => `bash ${path.join(hooksDir, script)}`;
  const byName = Object.fromEntries(HOOK_WRAPPERS.map((w) => [w.name, w]));

  return {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            "o9k-core-session",
            "o9k-memory-session",
            "o9k-update-check",
          ].map((name) => ({
            type: "command",
            command: cmd(`${name}.sh`),
            timeout: byName[name].timeout,
          })),
        },
      ],
      PreCompact: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: cmd("o9k-memory-precompact.sh"),
              timeout: byName["o9k-memory-precompact"].timeout,
            },
          ],
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
  const { marketplaceRoot: resolvedMarketplace } = resolveRoots(import.meta.url, marketplaceRoot);
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

  const existing = readJsonSafe(hooksJsonPath) ?? {};
  const patch = buildCodexHooksPatch(home);
  const merged = mergeHooksJson(existing, patch);

  if (!dryRun) {
    writeFileWithBackup(hooksJsonPath, `${JSON.stringify(merged, null, 2)}\n`);
  }

  const parts = [];
  if (installed.length) parts.push(`installed wrappers: ${installed.join(", ")}`);
  parts.push(`merged ${hooksJsonPath}`);
  parts.push(PRECOMPACT_NOTE);
  if (dryRun) parts.unshift("dry-run: no files written");

  return { ok: true, detail: parts.join("; ") };
}
