// wire-hermes.mjs — install the o9k statusline hook script for Hermes and
// idempotently patch hermes-agent's cli.py to call it. Hermes has no
// settings.json statusLine like Claude/Cursor; it renders its own status
// bar in cli.py, so getting o9k's line onto it means: (1) install a bash
// wrapper Hermes can shell out to, (2) teach cli.py to call that wrapper
// and fold the result into the status bar it already draws.
//
// Kept deliberately o9k-owned and independent of TIM's own Hermes patch
// (tim-cli's hermes-statusline-install.ts, method _get_tim_status): our
// method is _get_o9k_status, our script is hermes-o9k-statusline.sh, our
// JSON key is "line". Anchors below are chosen to survive whether TIM's
// patch ran first or not (see FRAGS_ANCHOR_RE comment).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileWithBackup } from "../hosts/common.mjs";

const SCRIPT_NAME = "hermes-o9k-statusline.sh";
const TEMPLATE_PATH = fileURLToPath(new URL("./hermes-o9k-statusline.sh", import.meta.url));
const ROOT_PLACEHOLDER = "__O9K_MARKETPLACE_ROOT__";

const O9K_METHOD = `    def _get_o9k_status(self) -> Dict[str, str]:
        """Call hermes-o9k-statusline.sh for the o9k status line."""
        try:
            import subprocess, json
            script = os.path.expanduser("~/.hermes/agent-hooks/hermes-o9k-statusline.sh")
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

const O9K_PREFIX_BLOCK = `
            o9k_status = self._get_o9k_status()
            o9k_prefix = o9k_status.get("line", "") if o9k_status else ""

`;

// Method anchor: insert _get_o9k_status right before the display-width
// helper, mirroring where TIM's own patch inserts _get_tim_status. Present
// in vanilla cli.py regardless of any prior TIM patch (TIM never rewrites
// this method's body, only its @staticmethod placement in a broken state
// we don't need to detect here — we just require *a* def line).
const METHOD_ANCHOR_WITH_DECORATOR_RE =
  /^([ \t]*)@staticmethod\n\1def _status_bar_display_width\(/m;
const METHOD_ANCHOR_PLAIN_RE = /^([ \t]*)def _status_bar_display_width\(/m;

// Prefix-computation anchor: same duration/yolo line TIM anchors on. Exists
// once in the source regardless of whether TIM already inserted its own
// block after it — String#replace only touches the first occurrence, so
// stacking both patches here is safe.
const DURATION_ANCHOR =
  '            duration_label = snapshot["duration"]\n            yolo_active = self._is_session_yolo_active()';

// Frags anchor: rather than anchor on the whole frags list literal (as TIM
// does, fragile — the literal differs once TIM's own patch has rewritten
// it into `frags = []` + `frags.extend([...])`), anchor on the one tuple
// line that survives both the vanilla and the TIM-patched shape: the
// model_short fragment. We splice a conditional list-unpack element in
// immediately before it, which is valid inside either a list literal or an
// .extend([...]) call argument list.
const FRAGS_ANCHOR_RE = /^([ \t]*)\("class:status-bar-strong", snapshot\["model_short"\]\),[ \t]*$/m;

// Mirror of the text FRAGS_ANCHOR_RE's replacer prepends — matched literally
// (indent-agnostic) so unpatchCliPySource can remove exactly what patching
// added, leaving the anchor line and any TIM splice untouched.
const FRAGS_PREPEND_RE =
  /^[ \t]*\*\(\[\("class:status-bar-strong", f" \{o9k_prefix\}"\), \("class:status-bar-dim", " \u2502 "\)\] if o9k_prefix else \[\]\),[ \t]*\n/m;

function isO9kCliPatched(source) {
  return source.includes("_get_o9k_status");
}

function isForeignCliPatched(source) {
  return /_get_tim_status|_get_hmem_status/.test(source);
}

/** Pure patch function — no I/O. Returns { source, changed, unsupported }. */
export function patchCliPySource(source) {
  if (isO9kCliPatched(source)) {
    return { source, changed: false };
  }

  const methodAnchorRe = METHOD_ANCHOR_WITH_DECORATOR_RE.test(source)
    ? METHOD_ANCHOR_WITH_DECORATOR_RE
    : METHOD_ANCHOR_PLAIN_RE;

  if (
    !methodAnchorRe.test(source) ||
    !source.includes(DURATION_ANCHOR) ||
    !FRAGS_ANCHOR_RE.test(source)
  ) {
    return { source, changed: false, unsupported: true };
  }

  let out = source;
  out = out.replace(methodAnchorRe, (m) => `${O9K_METHOD}${m}`);
  out = out.replace(DURATION_ANCHOR, DURATION_ANCHOR + O9K_PREFIX_BLOCK);
  out = out.replace(FRAGS_ANCHOR_RE, (m, indent) => {
    const prepend =
      `${indent}*([("class:status-bar-strong", f" {o9k_prefix}"), ` +
      `("class:status-bar-dim", " \u2502 ")] if o9k_prefix else []),\n`;
    return `${prepend}${m}`;
  });

  return { source: out, changed: true };
}

/**
 * Best-effort reverse of patchCliPySource — removes exactly the three
 * literal blocks patching adds (method, prefix-compute, frags-splice).
 * A foreign/TIM patch stacked alongside ours is untouched since it lives
 * outside those literals. No-op (changed: false) when o9k never patched.
 */
export function unpatchCliPySource(source) {
  if (!isO9kCliPatched(source)) return { source, changed: false };
  let out = source;
  out = out.replace(O9K_METHOD, "");
  out = out.replace(O9K_PREFIX_BLOCK, "");
  out = out.replace(FRAGS_PREPEND_RE, "");
  return { source: out, changed: out !== source };
}

function patchHermesCliPy({ cliPath, mode, dryRun }) {
  if (!fs.existsSync(cliPath)) {
    return { ok: false, unsupported: true, detail: "hermes-agent cli.py not found" };
  }

  const source = fs.readFileSync(cliPath, "utf8");

  if (isO9kCliPatched(source)) {
    return { ok: true, already: true, detail: "_get_o9k_status already present" };
  }

  if (mode === "keep" && isForeignCliPatched(source)) {
    return { ok: true, skipped: true, detail: "kept foreign/TIM status-bar patch" };
  }

  const { source: patched, changed, unsupported } = patchCliPySource(source);
  if (unsupported) {
    return { ok: false, unsupported: true, detail: "cli.py anchor not found" };
  }
  if (!changed) {
    return { ok: true, already: true, detail: "no changes needed" };
  }

  if (!dryRun) writeFileWithBackup(cliPath, patched);
  return { ok: true, detail: dryRun ? "would patch cli.py" : "patched cli.py" };
}

/**
 * Install the o9k Hermes statusline hook script and patch hermes-agent's
 * cli.py to call it.
 *
 * - mode "replace" (default): always install script; add o9k's cli.py hook
 *   alongside any existing (TIM/foreign) patch.
 * - mode "keep": if cli.py already carries a foreign/TIM patch (but not
 *   o9k's own), leave cli.py untouched — script is still installed.
 */
export function wireHermesStatusline({ home, marketplaceRoot, mode = "replace", dryRun = false }) {
  const hooksDir = path.join(home, ".hermes/agent-hooks");
  const scriptDest = path.join(hooksDir, SCRIPT_NAME);
  const resolvedRoot = path.resolve(marketplaceRoot);
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const rendered = template.replaceAll(ROOT_PLACEHOLDER, resolvedRoot);

  let scriptDetail;
  if (dryRun) {
    scriptDetail = `would install ${scriptDest}`;
  } else {
    const wrote = writeFileWithBackup(scriptDest, rendered, { mode: 0o755 });
    try {
      fs.chmodSync(scriptDest, 0o755);
    } catch {
      // best-effort on platforms that ignore mode in writeFileSync
    }
    scriptDetail = wrote ? `installed ${scriptDest}` : `unchanged ${scriptDest}`;
  }

  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  const cliResult = patchHermesCliPy({ cliPath, mode, dryRun });

  if (!cliResult.ok) {
    return { ...cliResult };
  }

  return {
    ok: true,
    ...(cliResult.already ? { already: true } : {}),
    ...(cliResult.skipped ? { skipped: true } : {}),
    detail: `script: ${scriptDetail}; cli.py: ${cliResult.detail}`,
  };
}
