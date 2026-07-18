import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { patchCliPySource, wireHermesStatusline } from "./wire-hermes.mjs";

const marketplaceRoot = path.join(fileURLToPath(new URL("../../..", import.meta.url)));

// Self-contained fixture — not a real hermes-agent snapshot. It only needs
// to contain the three anchors wire-hermes.mjs looks for (see comments in
// that file for why each was chosen):
//   1. `def _status_bar_display_width(` (with @staticmethod) — method anchor
//   2. the `duration_label = ...` / `yolo_active = ...` pair — prefix anchor
//   3. the `("class:status-bar-strong", snapshot["model_short"]),` tuple line — frags anchor
const FIXTURE_CLI_PY = `import os
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

            frags = [
                ("class:status-bar", " o "),
                ("class:status-bar-strong", snapshot["model_short"]),
                ("class:status-bar-dim", " | "),
                ("class:status-bar-dim", context_label),
                ("class:status-bar-dim", " | "),
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

const FIXTURE_CLI_PY_WITH_TIM = FIXTURE_CLI_PY.replace(
  "    @staticmethod\n    def _status_bar_display_width(text: str) -> int:",
  `    def _get_tim_status(self) -> Dict[str, str]:
        return {}

    @staticmethod
    def _status_bar_display_width(text: str) -> int:`,
);

function makeTmpHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-hermes-sl-"));
  fs.mkdirSync(path.join(tmp, ".hermes", "hermes-agent"), { recursive: true });
  return tmp;
}

function writeCliPy(home, content) {
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  fs.writeFileSync(cliPath, content);
  return cliPath;
}

test("patchCliPySource injects _get_o9k_status, prefix block, and frags splice", () => {
  const { source, changed } = patchCliPySource(FIXTURE_CLI_PY);
  assert.equal(changed, true);
  assert.match(source, /def _get_o9k_status\(self\) -> Dict\[str, str\]:/);
  assert.match(source, /hermes-o9k-statusline\.sh/);
  assert.match(source, /o9k_prefix = o9k_status\.get\("line", ""\)/);
  assert.match(source, /if o9k_prefix else \[\]\),\n\s*\("class:status-bar-strong", snapshot\["model_short"\]\)/);
});

test("patchCliPySource is idempotent", () => {
  const once = patchCliPySource(FIXTURE_CLI_PY);
  const twice = patchCliPySource(once.source);
  assert.equal(twice.changed, false);
  assert.equal(twice.source, once.source);
});

test("patchCliPySource stacks alongside an existing TIM patch", () => {
  const { source, changed } = patchCliPySource(FIXTURE_CLI_PY_WITH_TIM);
  assert.equal(changed, true);
  assert.match(source, /_get_tim_status/);
  assert.match(source, /_get_o9k_status/);
});

test("patchCliPySource reports unsupported when no anchor is found", () => {
  const { changed, unsupported } = patchCliPySource("class HermesCLI:\n    pass\n");
  assert.equal(changed, false);
  assert.equal(unsupported, true);
});

test("wireHermesStatusline installs script and patches cli.py", () => {
  const home = makeTmpHome();
  writeCliPy(home, FIXTURE_CLI_PY);

  const r = wireHermesStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, true);

  const scriptPath = path.join(home, ".hermes/agent-hooks/hermes-o9k-statusline.sh");
  assert.ok(fs.existsSync(scriptPath));
  const scriptBody = fs.readFileSync(scriptPath, "utf8");
  assert.match(scriptBody, /--host hermes --format hermes/);
  assert.doesNotMatch(scriptBody, /__O9K_MARKETPLACE_ROOT__/);
  const resolvedRoot = path.resolve(marketplaceRoot);
  assert.match(scriptBody, new RegExp(`ROOT="${resolvedRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.equal(fs.statSync(scriptPath).mode & 0o777, 0o755);

  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  const cliBody = fs.readFileSync(cliPath, "utf8");
  assert.match(cliBody, /_get_o9k_status/);
  assert.match(cliBody, /hermes-o9k-statusline\.sh/);
  assert.match(cliBody, /o9k_status\.get\("line", ""\)/);
  assert.ok(fs.existsSync(`${cliPath}.o9k-bak`));

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermesStatusline second run is idempotent (no double patch)", () => {
  const home = makeTmpHome();
  writeCliPy(home, FIXTURE_CLI_PY);

  const once = wireHermesStatusline({ home, marketplaceRoot, mode: "replace" });
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  const afterOnce = fs.readFileSync(cliPath, "utf8");

  const twice = wireHermesStatusline({ home, marketplaceRoot, mode: "replace" });
  const afterTwice = fs.readFileSync(cliPath, "utf8");

  assert.equal(once.ok, true);
  assert.equal(twice.ok, true);
  assert.equal(twice.already, true);
  assert.equal(afterTwice, afterOnce);
  // def line + one call site in the prefix block = 2 occurrences from a
  // single patch application; a double-patch would produce 4.
  assert.equal((afterTwice.match(/_get_o9k_status/g) || []).length, 2);

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermesStatusline mode keep skips cli.py when a foreign/TIM patch exists without o9k", () => {
  const home = makeTmpHome();
  writeCliPy(home, FIXTURE_CLI_PY_WITH_TIM);

  const r = wireHermesStatusline({ home, marketplaceRoot, mode: "keep" });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);

  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  const cliBody = fs.readFileSync(cliPath, "utf8");
  assert.doesNotMatch(cliBody, /_get_o9k_status/);
  assert.match(cliBody, /_get_tim_status/);

  const scriptPath = path.join(home, ".hermes/agent-hooks/hermes-o9k-statusline.sh");
  assert.ok(fs.existsSync(scriptPath), "script installs even when cli.py patch is skipped");

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermesStatusline mode replace patches even with an existing TIM patch", () => {
  const home = makeTmpHome();
  writeCliPy(home, FIXTURE_CLI_PY_WITH_TIM);

  const r = wireHermesStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, true);

  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  const cliBody = fs.readFileSync(cliPath, "utf8");
  assert.match(cliBody, /_get_o9k_status/);
  assert.match(cliBody, /_get_tim_status/);

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermesStatusline reports unsupported when cli.py is missing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-hermes-sl-nocli-"));
  fs.mkdirSync(path.join(home, ".hermes"), { recursive: true });

  const r = wireHermesStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, false);
  assert.equal(r.unsupported, true);
  assert.equal(r.detail, "hermes-agent cli.py not found");

  // Script install is independent and still happens.
  const scriptPath = path.join(home, ".hermes/agent-hooks/hermes-o9k-statusline.sh");
  assert.ok(fs.existsSync(scriptPath));

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermesStatusline reports unsupported when cli.py has no recognizable anchor", () => {
  const home = makeTmpHome();
  writeCliPy(home, "class HermesCLI:\n    pass\n");

  const r = wireHermesStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, false);
  assert.equal(r.unsupported, true);
  assert.equal(r.detail, "cli.py anchor not found");

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermesStatusline dryRun writes nothing", () => {
  const home = makeTmpHome();
  writeCliPy(home, FIXTURE_CLI_PY);
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  const before = fs.readFileSync(cliPath, "utf8");

  const r = wireHermesStatusline({ home, marketplaceRoot, mode: "replace", dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(cliPath, "utf8"), before);
  assert.equal(fs.existsSync(path.join(home, ".hermes/agent-hooks/hermes-o9k-statusline.sh")), false);

  fs.rmSync(home, { recursive: true, force: true });
});
