// strip-tim.mjs — remove TIM-owned host statusline wiring (Claude/Cursor/Hermes).
import fs from "node:fs";
import path from "node:path";
import { isTimStatuslineCommand } from "./detect-tim.mjs";
import { readJsonSafe, writeFileWithBackup } from "../hosts/common.mjs";

const TIM_METHOD_RE = /    def _get_tim_status[\s\S]*?(?=\n    def )/;

const TIM_PREFIX_BLOCK_RE =
  /\n            tim_status = self\._get_tim_status\(\)\n            tim_prefix = tim_status\.get\("line", ""\) if tim_status else ""\n\n/;

const TIM_FRAGS_PREPEND_RE =
  /^[ \t]*\*\(\[\("class:status-bar-strong", f" \{tim_prefix\}"\), \("class:status-bar-dim", " \u2502 "\)\] if tim_prefix else \[\]\),[ \t]*\n/m;

/** Pure transform — no I/O. Removes TIM method + obvious prefix/frags splices. */
export function stripTimFromCliPy(source) {
  let out = source;
  out = out.replace(TIM_METHOD_RE, "");
  out = out.replace(TIM_PREFIX_BLOCK_RE, "\n");
  out = out.replace(TIM_FRAGS_PREPEND_RE, "");
  return { source: out, changed: out !== source };
}

function stripHostStatusline({ configPath, dryRun }) {
  const existing = readJsonSafe(configPath);
  if (!existing) {
    return { stripped: false, detail: "no config" };
  }

  const cmd = existing.statusLine?.command;
  if (!isTimStatuslineCommand(cmd)) {
    return { stripped: false, detail: "not TIM" };
  }

  const next = { ...existing };
  delete next.statusLine;
  if (!dryRun) {
    writeFileWithBackup(configPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  return { stripped: true, detail: `removed statusLine from ${configPath}` };
}

function stripHermesTim({ home, dryRun }) {
  const hooksDir = path.join(home, ".hermes/agent-hooks");
  const timScript = path.join(hooksDir, "tim-hermes-statusline.sh");
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");

  const details = [];
  let stripped = false;

  if (fs.existsSync(timScript)) {
    if (!dryRun) fs.unlinkSync(timScript);
    stripped = true;
    details.push("removed tim-hermes-statusline.sh");
  }

  try {
    const source = fs.readFileSync(cliPath, "utf8");
    const { source: patched, changed } = stripTimFromCliPy(source);
    if (changed) {
      if (!dryRun) writeFileWithBackup(cliPath, patched);
      stripped = true;
      details.push("stripped _get_tim_status from cli.py");
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  return {
    stripped,
    detail: details.length ? details.join("; ") : "no TIM wiring",
  };
}

/**
 * Strip TIM-owned statusline wiring from Claude, Cursor, and Hermes.
 * Foreign and o9k commands/patches are left untouched.
 */
export function stripTimStatusline({ home, dryRun = false }) {
  return {
    claude: stripHostStatusline({
      configPath: path.join(home, ".claude/settings.json"),
      dryRun,
    }),
    cursor: stripHostStatusline({
      configPath: path.join(home, ".cursor/cli-config.json"),
      dryRun,
    }),
    hermes: stripHermesTim({ home, dryRun }),
  };
}
