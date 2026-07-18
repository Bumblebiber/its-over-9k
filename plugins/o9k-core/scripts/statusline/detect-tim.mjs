// detect-tim.mjs — identify TIM-owned host statusline wiring.
import fs from "node:fs";
import path from "node:path";
import { readJsonSafe } from "../hosts/common.mjs";

export const TIM_COMMAND_MARKERS = [
  "tim-statusline",
  "tim statusline",
  "tim-hooks",
  "tim-hermes-statusline",
  "packages/tim-hooks/scripts/tim-statusline",
];

export function isTimStatuslineCommand(cmd) {
  if (typeof cmd !== "string" || !cmd) return false;
  const lower = cmd.toLowerCase();
  if (lower.includes("o9k-statusline")) return false;
  return TIM_COMMAND_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

export function detectTimStatusline({ home }) {
  const claudeCmd = readJsonSafe(path.join(home, ".claude/settings.json"))?.statusLine?.command;
  const cursorCmd = readJsonSafe(path.join(home, ".cursor/cli-config.json"))?.statusLine?.command;
  const claude = isTimStatuslineCommand(claudeCmd);
  const cursor = isTimStatuslineCommand(cursorCmd);

  let hermes = false;
  const script = path.join(home, ".hermes/agent-hooks/tim-hermes-statusline.sh");
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  if (fs.existsSync(script)) hermes = true;
  try {
    if (fs.readFileSync(cliPath, "utf8").includes("_get_tim_status")) hermes = true;
  } catch {
    // missing cli.py
  }

  return { claude, cursor, hermes, any: claude || cursor || hermes };
}
