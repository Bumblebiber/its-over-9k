import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateTimStatusline } from "./migrate.mjs";
import { loadConfig } from "./config.mjs";

const marketplaceRoot = path.join(fileURLToPath(new URL("../../..", import.meta.url)));

// Self-contained fixture — same anchors wire-hermes.mjs looks for (copied
// from wire-hermes.test.mjs FIXTURE_CLI_PY/FIXTURE_CLI_PY_WITH_TIM; not
// exported there, so duplicated here rather than imported).
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

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mg-"));
}

test("action abort — no config write, no wire", () => {
  const home = tmpHome();
  process.env.O9K_STATUSLINE = path.join(home, ".o9k/statusline.json");
  const r = migrateTimStatusline({
    home,
    marketplaceRoot,
    action: "abort",
    elements: ["tim", "model"],
  });
  assert.equal(r.aborted, true);
  assert.equal(loadConfig(), null);
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});

test("action remove-tim strips TIM Claude then wires o9k", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude/settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "bash /x/tim-statusline.sh" } }),
  );
  process.env.O9K_STATUSLINE = path.join(home, ".o9k/statusline.json");
  const r = migrateTimStatusline({
    home,
    marketplaceRoot,
    action: "remove-tim",
    elements: ["tim", "model"],
  });
  assert.equal(r.aborted, false);
  assert.equal(r.stripResults.claude.stripped, true);
  const cmd = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"))
    .statusLine.command;
  assert.match(cmd, /o9k-statusline/);
  const cfg = loadConfig();
  assert.equal(cfg.enabled, true);
  assert.ok(cfg.elements.includes("tim"));
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});

test("action keep-tim on Claude keeps TIM command and skips o9k wire for claude", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude/settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "bash /x/tim-statusline.sh" } }),
  );
  process.env.O9K_STATUSLINE = path.join(home, ".o9k/statusline.json");
  const r = migrateTimStatusline({
    home,
    marketplaceRoot,
    action: "keep-tim",
    elements: ["model"],
    hostsPresent: { claude: true, cursor: false, hermes: false },
  });
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8")).statusLine
      .command,
    "bash /x/tim-statusline.sh",
  );
  assert.equal(r.wireResults?.claude?.skipped, true);
  assert.equal(r.warnings.length, 0);
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});

test("action keep-tim on Hermes stacks TIM+o9k and returns a stack warning", () => {
  const home = tmpHome();
  const hooks = path.join(home, ".hermes/agent-hooks");
  const agent = path.join(home, ".hermes/hermes-agent");
  fs.mkdirSync(hooks, { recursive: true });
  fs.mkdirSync(agent, { recursive: true });
  fs.writeFileSync(path.join(hooks, "tim-hermes-statusline.sh"), "#!/bin/bash\n");
  fs.writeFileSync(path.join(agent, "cli.py"), FIXTURE_CLI_PY_WITH_TIM);
  process.env.O9K_STATUSLINE = path.join(home, ".o9k/statusline.json");
  const r = migrateTimStatusline({
    home,
    marketplaceRoot,
    action: "keep-tim",
    elements: ["tim"],
    hostsPresent: { hermes: true },
  });
  const py = fs.readFileSync(path.join(agent, "cli.py"), "utf8");
  assert.ok(py.includes("_get_tim_status"));
  assert.ok(py.includes("_get_o9k_status"));
  assert.ok(r.warnings.some((w) => /stack/i.test(w)));
  assert.equal(r.wireResults?.hermes?.ok, true);
  // TIM script untouched — keep-tim never strips.
  assert.ok(fs.existsSync(path.join(hooks, "tim-hermes-statusline.sh")));
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});

test("action keep-tim with no TIM detected wires o9k normally and warns nothing", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  process.env.O9K_STATUSLINE = path.join(home, ".o9k/statusline.json");
  const r = migrateTimStatusline({
    home,
    marketplaceRoot,
    action: "keep-tim",
    elements: ["model"],
    hostsPresent: { claude: true, cursor: false, hermes: false },
  });
  const cmd = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"))
    .statusLine.command;
  assert.match(cmd, /o9k-statusline/);
  assert.equal(r.warnings.length, 0);
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});

test("dryRun writes no config and no host files", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude/settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "bash /x/tim-statusline.sh" } }),
  );
  process.env.O9K_STATUSLINE = path.join(home, ".o9k/statusline.json");
  const r = migrateTimStatusline({
    home,
    marketplaceRoot,
    action: "remove-tim",
    elements: ["tim"],
    hostsPresent: { claude: true, cursor: false, hermes: false },
    dryRun: true,
  });
  assert.equal(r.aborted, false);
  assert.equal(loadConfig(), null);
  const cmd = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"))
    .statusLine.command;
  assert.equal(cmd, "bash /x/tim-statusline.sh");
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});
