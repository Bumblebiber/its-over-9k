import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTimStatusline } from "./strip-tim.mjs";

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "o9k-st-"));
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
