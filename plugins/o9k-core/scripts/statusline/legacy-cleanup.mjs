// legacy-cleanup.mjs — recognise and remove statusline wiring that older
// o9k versions installed.
//
// o9k no longer wires the statusline into host configs (see
// docs/STATUSLINE.md): writing into Claude/Cursor config files and
// source-patching Hermes' cli.py was the most harness-fragile code in the
// repo, and the renderer works fine when the user adds four lines of config
// themselves. The *write* path is gone; this *removal* path stays, so anyone
// who wired it with o9k ≤ 0.10.x can still get a clean uninstall.
//
// Stability note: everything here matches text o9k itself wrote. It does not
// depend on the current shape of Hermes' cli.py, so upstream changes cannot
// break the cleanup of an existing patch.

/** Did some o9k version wire this statusLine command? */
export function isO9kStatuslineCommand(cmd) {
  return typeof cmd === "string" && cmd.includes("o9k-statusline");
}

/** The Hermes cli.py method older o9k versions spliced in. */
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

// Matched literally (indent-agnostic) so we remove exactly what the old
// patcher added, leaving the anchor line and any TIM splice untouched.
const FRAGS_PREPEND_RE =
  /^[ \t]*\*\(\[\("class:status-bar-strong", f" \{o9k_prefix\}"\), \("class:status-bar-dim", " │ "\)\] if o9k_prefix else \[\]\),[ \t]*\n/m;

export function isO9kCliPatched(source) {
  return source.includes("_get_o9k_status");
}

/**
 * Reverse of the old Hermes cli.py patch. Pure — no I/O. Foreign patches
 * (TIM's _get_tim_status, hmem's) are left strictly alone.
 */
export function unpatchCliPySource(source) {
  if (!isO9kCliPatched(source)) return { source, changed: false };
  let out = source;
  out = out.replace(O9K_METHOD, "");
  out = out.replace(O9K_PREFIX_BLOCK, "");
  out = out.replace(FRAGS_PREPEND_RE, "");
  return { source: out, changed: out !== source };
}
