import path from "node:path";
import { readJsonSafe, writeFileWithBackup } from "../hosts/common.mjs";
import { isO9kStatuslineCommand, o9kStatuslineCommand } from "./command-path.mjs";

export function wireCursorStatusline({ home, marketplaceRoot, mode = "replace", dryRun = false }) {
  const configPath = path.join(home, ".cursor/cli-config.json");
  const existing = readJsonSafe(configPath) ?? {};
  const prev = existing.statusLine?.command;
  if (mode === "keep" && prev && !isO9kStatuslineCommand(prev)) {
    return { ok: true, skipped: true, detail: "kept existing statusLine" };
  }
  const next = {
    ...existing,
    statusLine: {
      type: "command",
      command: o9kStatuslineCommand(marketplaceRoot, "cursor"),
    },
  };
  if (!dryRun) writeFileWithBackup(configPath, `${JSON.stringify(next, null, 2)}\n`);
  return { ok: true, detail: `wired ${configPath}` };
}
