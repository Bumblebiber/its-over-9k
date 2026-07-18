import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTimStatusline, stripTimFromCliPy } from "./strip-tim.mjs";
import { patchCliPySource } from "./wire-hermes.mjs";

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "o9k-st-"));
}

// Vanilla Hermes cli.py shape both TIM's real installer
// (~/projects/tim/packages/tim-cli/src/hermes-statusline-install.ts) and
// o9k's own wire-hermes.mjs anchor on: the duration/yolo pair, the
// @staticmethod-decorated width helper, and the wide-mode frags list
// ending in the model_short tuple.
const VANILLA_CLI_PY = `import os
from typing import Dict


class HermesCLI:
    def _is_session_yolo_active(self) -> bool:
        return False

    def _build_context_bar(self, percent):
        return "#" * percent

    def render_status_bar(self, snapshot):
        try:
            duration_label = snapshot["duration"]
            yolo_active = self._is_session_yolo_active()

            percent = snapshot["percent"]
            context_label = snapshot["context_label"]
            bar_style = "class:status-bar"
            percent_label = f"{percent}%"

            if True:
                if True:
                    frags = [
                        ("class:status-bar", " \u2695 "),
                        ("class:status-bar-strong", snapshot["model_short"]),
                        ("class:status-bar-dim", " \u2502 "),
                        ("class:status-bar-dim", context_label),
                        ("class:status-bar-dim", " \u2502 "),
                        (bar_style, self._build_context_bar(percent)),
                        ("class:status-bar-dim", " "),
                        (bar_style, percent_label),
                    ]
            return frags
        except Exception:
            return []

    @staticmethod
    def _status_bar_display_width(text: str) -> int:
        return len(text)
`;

// Literal blocks TIM's own installer injects — copied verbatim from
// hermes-statusline-install.ts, mirrored here (not imported) so this test
// fails loudly if strip-tim.mjs's own copies drift from TIM's real shape.
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

const DURATION_ANCHOR =
  '            duration_label = snapshot["duration"]\n            yolo_active = self._is_session_yolo_active()';

const STATIC_WIDTH_ANCHOR = '    @staticmethod\n    def _status_bar_display_width(text: str) -> int:';

/** Applies TIM's real cli.py patch shape (method + prefix block + frags
 * rewrite) exactly as hermes-statusline-install.ts's patchHermesCliSource
 * does for a vanilla (already-@staticmethod) width anchor. */
function applyRealTimPatch(source) {
  let out = source;
  out = out.replace(STATIC_WIDTH_ANCHOR, TIM_STATUS_METHOD + STATIC_WIDTH_ANCHOR);
  out = out.replace(DURATION_ANCHOR, DURATION_ANCHOR + TIM_PREFIX_BLOCK);
  out = out.replace(TIM_WIDE_FRAGS_OLD, TIM_WIDE_FRAGS_NEW);
  return out;
}

test("stripTim removes TIM Claude statusLine and backs up", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const settings = path.join(home, ".claude/settings.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({ statusLine: { type: "command", command: "bash /x/tim-statusline.sh" }, other: 1 }),
  );
  const r = stripTimStatusline({ home });
  assert.equal(r.claude.stripped, true);
  assert.ok(fs.existsSync(`${settings}.o9k-bak`));
  const j = JSON.parse(fs.readFileSync(settings, "utf8"));
  assert.equal(j.statusLine, undefined);
  assert.equal(j.other, 1);
  fs.rmSync(home, { recursive: true, force: true });
});

test("stripTim leaves foreign and o9k Claude commands alone", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const settings = path.join(home, ".claude/settings.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({ statusLine: { type: "command", command: "echo foreign" } }),
  );
  const r = stripTimStatusline({ home });
  assert.equal(r.claude.stripped, false);
  assert.equal(JSON.parse(fs.readFileSync(settings, "utf8")).statusLine.command, "echo foreign");
  fs.rmSync(home, { recursive: true, force: true });
});

test("stripTim removes Hermes TIM method and script, keeps o9k patch", () => {
  const home = tmpHome();
  const hooks = path.join(home, ".hermes/agent-hooks");
  const agent = path.join(home, ".hermes/hermes-agent");
  fs.mkdirSync(hooks, { recursive: true });
  fs.mkdirSync(agent, { recursive: true });
  fs.writeFileSync(path.join(hooks, "tim-hermes-statusline.sh"), "#!/bin/bash\necho tim\n");
  fs.writeFileSync(path.join(hooks, "hermes-o9k-statusline.sh"), "#!/bin/bash\necho o9k\n");
  fs.writeFileSync(
    path.join(agent, "cli.py"),
    [
      "class X:",
      "    def _get_tim_status(self):",
      "        return {}",
      "    def _get_o9k_status(self):",
      "        return {}",
      "    def _status_bar_display_width(self):",
      "        return 80",
      "",
    ].join("\n"),
  );
  const r = stripTimStatusline({ home });
  assert.equal(r.hermes.stripped, true);
  assert.equal(fs.existsSync(path.join(hooks, "tim-hermes-statusline.sh")), false);
  assert.equal(fs.existsSync(path.join(hooks, "hermes-o9k-statusline.sh")), true);
  const py = fs.readFileSync(path.join(agent, "cli.py"), "utf8");
  assert.equal(py.includes("_get_tim_status"), false);
  assert.equal(py.includes("_get_o9k_status"), true);
  fs.rmSync(home, { recursive: true, force: true });
});

test("stripTim dryRun leaves files unchanged", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const settings = path.join(home, ".claude/settings.json");
  const originalSettings = JSON.stringify({
    statusLine: { type: "command", command: "bash /x/tim-statusline.sh" },
    other: 1,
  });
  fs.writeFileSync(settings, originalSettings);

  const hooks = path.join(home, ".hermes/agent-hooks");
  const agent = path.join(home, ".hermes/hermes-agent");
  fs.mkdirSync(hooks, { recursive: true });
  fs.mkdirSync(agent, { recursive: true });
  const timScript = path.join(hooks, "tim-hermes-statusline.sh");
  const originalTimScript = "#!/bin/bash\necho tim\n";
  fs.writeFileSync(timScript, originalTimScript);
  const cliPath = path.join(agent, "cli.py");
  const originalCli = [
    "class X:",
    "    def _get_tim_status(self):",
    "        return {}",
    "    def _get_o9k_status(self):",
    "        return {}",
    "",
  ].join("\n");
  fs.writeFileSync(cliPath, originalCli);

  const r = stripTimStatusline({ home, dryRun: true });
  assert.equal(r.claude.stripped, true);
  assert.equal(r.hermes.stripped, true);
  assert.equal(fs.readFileSync(settings, "utf8"), originalSettings);
  assert.ok(fs.existsSync(timScript));
  assert.equal(fs.readFileSync(timScript, "utf8"), originalTimScript);
  assert.equal(fs.readFileSync(cliPath, "utf8"), originalCli);
  assert.equal(fs.existsSync(`${settings}.o9k-bak`), false);
  assert.equal(fs.existsSync(`${cliPath}.o9k-bak`), false);
  fs.rmSync(home, { recursive: true, force: true });
});

test("stripTimFromCliPy reverses the REAL TIM patch shape (method + prefix block + frags rewrite)", () => {
  const patched = applyRealTimPatch(VANILLA_CLI_PY);
  // Sanity: the fixture really carries TIM's exact literal shape before stripping.
  assert.ok(patched.includes(TIM_STATUS_METHOD));
  assert.ok(patched.includes(TIM_PREFIX_BLOCK));
  assert.ok(patched.includes(TIM_WIDE_FRAGS_NEW));

  const { source: stripped, changed } = stripTimFromCliPy(patched);
  assert.equal(changed, true);
  assert.equal(stripped.includes("_get_tim_status"), false);
  assert.equal(stripped.includes("tim = self._get_tim_status()"), false);
  assert.equal(stripped.includes("tim_prefix"), false);
  assert.ok(stripped.includes(TIM_WIDE_FRAGS_OLD));
});

test("stripTimFromCliPy removes real TIM blocks but leaves stacked o9k blocks alone", () => {
  const timPatched = applyRealTimPatch(VANILLA_CLI_PY);
  const { source: stacked, changed: o9kChanged } = patchCliPySource(timPatched);
  assert.equal(o9kChanged, true);
  assert.ok(stacked.includes("_get_o9k_status"));

  const { source: stripped, changed } = stripTimFromCliPy(stacked);
  assert.equal(changed, true);
  assert.equal(stripped.includes("_get_tim_status"), false);
  assert.equal(stripped.includes("tim = self._get_tim_status()"), false);
  assert.equal(stripped.includes("tim_prefix"), false);
  // o9k's own splice survives untouched.
  assert.ok(stripped.includes("_get_o9k_status"));
  assert.ok(stripped.includes("hermes-o9k-statusline.sh"));
  assert.ok(stripped.includes("o9k_prefix"));
});
