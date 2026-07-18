import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isTimStatuslineCommand,
  detectTimStatusline,
} from "./detect-tim.mjs";

test("isTimStatuslineCommand matches TIM markers", () => {
  assert.equal(isTimStatuslineCommand("bash /x/tim-statusline.sh"), true);
  assert.equal(isTimStatuslineCommand("tim statusline --cwd /p"), true);
  assert.equal(isTimStatuslineCommand("/opt/tim-hooks/scripts/tim-statusline.sh"), true);
  assert.equal(isTimStatuslineCommand("node …/o9k-statusline.mjs --host claude"), false);
  assert.equal(isTimStatuslineCommand("echo foreign"), false);
  assert.equal(isTimStatuslineCommand(null), false);
});

test("detectTimStatusline finds Claude TIM command", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-dt-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude/settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "bash /tmp/tim-statusline.sh" } }),
  );
  const d = detectTimStatusline({ home });
  assert.equal(d.any, true);
  assert.equal(d.claude, true);
  assert.equal(d.cursor, false);
  assert.equal(d.hermes, false);
  fs.rmSync(home, { recursive: true, force: true });
});

test("detectTimStatusline finds Hermes TIM markers", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-dt-"));
  const hooks = path.join(home, ".hermes/agent-hooks");
  const agent = path.join(home, ".hermes/hermes-agent");
  fs.mkdirSync(hooks, { recursive: true });
  fs.mkdirSync(agent, { recursive: true });
  fs.writeFileSync(path.join(hooks, "tim-hermes-statusline.sh"), "#!/bin/bash\n");
  fs.writeFileSync(path.join(agent, "cli.py"), "def _get_tim_status(self):\n    return {}\n");
  const d = detectTimStatusline({ home });
  assert.equal(d.hermes, true);
  assert.equal(d.any, true);
  fs.rmSync(home, { recursive: true, force: true });
});

test("detectTimStatusline empty home → any false", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-dt-"));
  assert.equal(detectTimStatusline({ home }).any, false);
  fs.rmSync(home, { recursive: true, force: true });
});
