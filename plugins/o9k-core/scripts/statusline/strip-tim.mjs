// strip-tim.mjs — remove TIM-owned host statusline wiring (Claude/Cursor/Hermes).
import fs from "node:fs";
import path from "node:path";
import { isTimStatuslineCommand } from "./detect-tim.mjs";
import { readJsonSafe, writeFileWithBackup } from "../hosts/common.mjs";

// Exact literal blocks TIM's own installer injects — copied verbatim from
// ~/projects/tim/packages/tim-cli/src/hermes-statusline-install.ts
// (TIM_STATUS_METHOD, TIM_PREFIX_BLOCK, wideFragsOld/wideFragsNew). Matching
// literally (not via approximating regex) is what lets removal exactly
// reverse TIM's patcher instead of accidentally targeting o9k's own
// differently-shaped splices (o9k uses `_get_o9k_status` / `o9k_prefix`).
const TIM_STATUS_METHOD = `    def _get_tim_status(self) -> Dict[str, str]:
        """Call tim-hermes-statusline.sh for TIM project / batch counter."""
        try:
            import subprocess, json
            script = os.path.expanduser("~/.hermes/agent-hooks/tim-hermes-statusline.sh")
            if not os.path.isfile(script):
                return {}
            result = subprocess.run(
                ["bash", script], capture_output=True, text=True, timeout=3
            )
            if result.returncode == 0 and result.stdout.strip():
                return json.loads(result.stdout)
        except Exception:
            pass
        return {}

`;

const TIM_PREFIX_BLOCK = `
            tim = self._get_tim_status()
            tim_prefix = ""
            if tim:
                parts = []
                if tim.get("device"):
                    parts.append(tim["device"])
                proj = tim.get("project", "")
                o_node = tim.get("o_node", "")
                if o_node:
                    proj = f"{proj} \u2192 {o_node}"
                if proj:
                    parts.append(proj)
                if tim.get("counter"):
                    parts.append(tim["counter"])
                if parts:
                    tim_prefix = " \u2502 ".join(parts)

`;

const TIM_WIDE_FRAGS_OLD = `                    frags = [
                        ("class:status-bar", " \u2695 "),
                        ("class:status-bar-strong", snapshot["model_short"]),
                        ("class:status-bar-dim", " \u2502 "),
                        ("class:status-bar-dim", context_label),
                        ("class:status-bar-dim", " \u2502 "),
                        (bar_style, self._build_context_bar(percent)),
                        ("class:status-bar-dim", " "),
                        (bar_style, percent_label),
                    ]`;

const TIM_WIDE_FRAGS_NEW = `                    frags = []
                    if tim_prefix:
                        frags.append(("class:status-bar-strong", f" {tim_prefix}"))
                        frags.append(("class:status-bar-dim", " \u2502 "))
                    frags.extend([
                        ("class:status-bar", " \u2695 "),
                        ("class:status-bar-strong", snapshot["model_short"]),
                        ("class:status-bar-dim", " \u2502 "),
                        ("class:status-bar-dim", context_label),
                        ("class:status-bar-dim", " \u2502 "),
                        (bar_style, self._build_context_bar(percent)),
                        ("class:status-bar-dim", " "),
                        (bar_style, percent_label),
                    ])`;

// Prefix/suffix halves of the wideFrags rewrite above — used as a surgical
// fallback when a *different* stacked patch (e.g. o9k's own frags splice,
// which lands inside the `frags.extend([...])` argument list) breaks the
// whole-block literal match. This still reverses TIM's own wrapper
// (`frags = []` / `if tim_prefix: ...` / `.extend([` … `])`) without
// touching whatever else got spliced in between.
const TIM_FRAGS_NEW_PREFIX = `                    frags = []
                    if tim_prefix:
                        frags.append(("class:status-bar-strong", f" {tim_prefix}"))
                        frags.append(("class:status-bar-dim", " \u2502 "))
                    frags.extend([
`;
const TIM_FRAGS_OLD_PREFIX = `                    frags = [
`;
const TIM_FRAGS_NEW_SUFFIX = "                    ])";
const TIM_FRAGS_OLD_SUFFIX = "                    ]";

// Fallback for minimal method-only fixtures (existing tests / hand-rolled
// stubs) that don't carry TIM's exact literal shape: remove from
// `def _get_tim_status` through the next sibling `def ` at the same indent.
const TIM_METHOD_FALLBACK_RE = /    def _get_tim_status[\s\S]*?(?=\n    def )/;

function revertTimFrags(source) {
  if (source.includes(TIM_WIDE_FRAGS_NEW)) {
    return source.replace(TIM_WIDE_FRAGS_NEW, TIM_WIDE_FRAGS_OLD);
  }
  if (!source.includes(TIM_FRAGS_NEW_PREFIX)) return source;

  let out = source.replace(TIM_FRAGS_NEW_PREFIX, TIM_FRAGS_OLD_PREFIX);
  const openIdx = out.indexOf(TIM_FRAGS_OLD_PREFIX);
  const suffixIdx = out.indexOf(TIM_FRAGS_NEW_SUFFIX, openIdx + TIM_FRAGS_OLD_PREFIX.length);
  if (suffixIdx === -1) return out;
  return (
    out.slice(0, suffixIdx) +
    TIM_FRAGS_OLD_SUFFIX +
    out.slice(suffixIdx + TIM_FRAGS_NEW_SUFFIX.length)
  );
}

/** Pure transform — no I/O. Reverses TIM's exact cli.py patch shape when
 * present (method + prefix-compute + frags rewrite), falling back to a
 * conservative method-only regex for non-TIM-exact fixtures. */
export function stripTimFromCliPy(source) {
  let out = revertTimFrags(source);

  if (out.includes(TIM_PREFIX_BLOCK)) {
    out = out.replace(TIM_PREFIX_BLOCK, "");
  }
  if (out.includes(TIM_STATUS_METHOD)) {
    out = out.replace(TIM_STATUS_METHOD, "");
  } else if (TIM_METHOD_FALLBACK_RE.test(out)) {
    out = out.replace(TIM_METHOD_FALLBACK_RE, "");
  }

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
