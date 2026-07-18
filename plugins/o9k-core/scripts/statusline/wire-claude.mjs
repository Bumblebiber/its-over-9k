import path from "node:path";
import { readJsonSafe, writeFileWithBackup } from "../hosts/common.mjs";
import { isO9kStatuslineCommand, o9kStatuslineCommand } from "./command-path.mjs";

export function wireClaudeStatusline({ home, marketplaceRoot, mode = "replace", dryRun = false }) {
  const settingsPath = path.join(home, ".claude/settings.json");
  const existing = readJsonSafe(settingsPath) ?? {};
  const prev = existing.statusLine?.command;
  if (mode === "keep" && prev && !isO9kStatuslineCommand(prev)) {
    return { ok: true, skipped: true, detail: "kept existing statusLine" };
  }
  const next = {
    ...existing,
    statusLine: {
      type: "command",
      command: o9kStatuslineCommand(marketplaceRoot, "claude"),
    },
  };
  if (!dryRun) writeFileWithBackup(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  return { ok: true, detail: `wired ${settingsPath}` };
}
