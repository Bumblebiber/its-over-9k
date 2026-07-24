import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "./skills-sync.mjs";
import { wireCodex } from "./hosts/wire-codex.mjs";
import { wireCursor } from "./hosts/wire-cursor.mjs";
import { wireOpencode } from "./hosts/wire-opencode.mjs";
import { wireHermes } from "./hosts/wire-hermes.mjs";
import { doctor } from "./o9k-doctor.mjs";
import { uninstall } from "./o9k-uninstall.mjs";
import { unpatchCliPySource } from "./statusline/legacy-cleanup.mjs";

const coreRoot = fileURLToPath(new URL("..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");

// Self-contained fixture — not a real hermes-agent snapshot; just the shape
// the o9k ≤ 0.10.x statusline patch used to be applied to. o9k no longer
// patches cli.py (see docs/STATUSLINE.md); these fixtures exist so the
// *removal* path stays covered for people who wired it back then.
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

// Minimal home for statusline-only doctor/uninstall checks — isolated from
// the hook-wiring fake install above (host-wiring artifacts are unrelated
// noise for these tests).
function makeStatuslineHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-doctor-sl-"));
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(tmp, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  return { tmp, pathEnv: binDir };
}

// ── legacy artifacts, reconstructed verbatim ──────────────────────────────
// These literals are what o9k ≤ 0.10.x wrote. They are duplicated here on
// purpose rather than imported: the cleanup code must keep removing this
// exact historical text, so the test pins the text, not the implementation.

const LEGACY_O9K_METHOD = `    def _get_o9k_status(self) -> Dict[str, str]:
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

const LEGACY_PREFIX_BLOCK = `
            o9k_status = self._get_o9k_status()
            o9k_prefix = o9k_status.get("line", "") if o9k_status else ""

`;

const LEGACY_DURATION_ANCHOR =
  '            duration_label = snapshot["duration"]\n            yolo_active = self._is_session_yolo_active()';

const LEGACY_FRAGS_LINE =
  '                *([("class:status-bar-strong", f" {o9k_prefix}"), ("class:status-bar-dim", " │ ")] if o9k_prefix else []),';

const LEGACY_MODEL_LINE = '                ("class:status-bar-strong", snapshot["model_short"]),';

const LEGACY_METHOD_ANCHOR =
  "    @staticmethod\n    def _status_bar_display_width(";

/** cli.py as the old wiring left it. */
function legacyPatchedCliPy(source = FIXTURE_CLI_PY) {
  return source
    .replace(LEGACY_METHOD_ANCHOR, LEGACY_O9K_METHOD + LEGACY_METHOD_ANCHOR)
    .replace(LEGACY_DURATION_ANCHOR, LEGACY_DURATION_ANCHOR + LEGACY_PREFIX_BLOCK)
    .replace(LEGACY_MODEL_LINE, LEGACY_FRAGS_LINE + "\n" + LEGACY_MODEL_LINE);
}

/** A statusLine command as the old wiring wrote it. */
function writeLegacyStatusLine(file, scriptPath) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      { statusLine: { type: "command", command: `${process.execPath} ${scriptPath} --host x` } },
      null,
      2
    )
  );
}

const LIVE_STATUSLINE_SCRIPT = path.join(coreRoot, "scripts/statusline/o9k-statusline.mjs");

// Full fake install: codex + cursor + opencode + hermes wired under a tmp home.
function makeWiredHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-doctor-"));
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  for (const b of ["codex", "cursor-agent"]) {
    fs.writeFileSync(path.join(binDir, b), "", { mode: 0o755 });
  }
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".config/opencode"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".hermes"), { recursive: true });
  syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot, pathEnv: binDir });
  wireCodex({ home: tmp, marketplaceRoot: marketRoot });
  wireCursor({ home: tmp, marketplaceRoot: marketRoot });
  wireOpencode({ home: tmp, marketplaceRoot: marketRoot });
  wireHermes({ home: tmp, marketplaceRoot: marketRoot });
  return { tmp, pathEnv: binDir };
}

test("doctor reports a healthy wired install", () => {
  const { tmp, pathEnv } = makeWiredHome();
  const r = doctor({ home: tmp, pathEnv });
  assert.ok(r.artifacts.some((a) => a.kind === "skill-link" && a.state === "ok"));
  assert.ok(r.artifacts.some((a) => a.kind === "hook-wrapper" && a.state === "ok"));
  assert.ok(r.artifacts.some((a) => a.kind === "opencode-plugin" && a.state === "ok"));
  assert.deepEqual(
    r.problems.filter((p) => !p.startsWith("skills out of sync")),
    []
  );
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor flags dangling symlinks and stale baked wrapper paths", () => {
  const { tmp, pathEnv } = makeWiredHome();
  // Dangle every skill link by deleting the canonical dir.
  fs.rmSync(path.join(tmp, ".agents/skills/o9k"), { recursive: true, force: true });
  // Stale wrapper: bake a marketplace path that doesn't exist.
  fs.writeFileSync(
    path.join(tmp, ".codex/hooks/o9k-stale-test.sh"),
    '#!/usr/bin/env bash\nexport O9K_MARKETPLACE_ROOT="/nonexistent/o9k-clone"\nexec bash "/nonexistent/o9k-clone/run.sh" x\n',
    { mode: 0o755 }
  );
  const r = doctor({ home: tmp, pathEnv });
  assert.ok(r.problems.some((p) => p.includes("dangling skill symlink")));
  assert.ok(r.problems.some((p) => p.includes("/nonexistent/o9k-clone")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("uninstall dry-run lists artifacts but writes nothing", () => {
  const { tmp, pathEnv } = makeWiredHome();
  const before = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  const r = uninstall({ home: tmp, dryRun: true, pathEnv });
  assert.ok(r.removed.length > 0);
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k")));
  assert.ok(fs.existsSync(path.join(tmp, ".config/opencode/plugins/o9k.ts")));
  const after = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  assert.deepEqual(after, before);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("uninstall removes o9k artifacts and strips hook configs, keeps foreign content", () => {
  const { tmp, pathEnv } = makeWiredHome();

  // Foreign content that must survive: a real dir named o9k-something, a
  // foreign hook entry in codex hooks.json, a foreign hermes hook line.
  const foreignSkill = path.join(tmp, ".codex/skills/o9k-my-own-skill");
  fs.mkdirSync(foreignSkill, { recursive: true });
  fs.writeFileSync(path.join(foreignSkill, "SKILL.md"), "# mine\n");
  const codexHooks = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  codexHooks.hooks.SessionStart[0].hooks.push({ type: "command", command: "echo foreign" });
  fs.writeFileSync(path.join(tmp, ".codex/hooks.json"), JSON.stringify(codexHooks, null, 2));

  const r = uninstall({ home: tmp, dryRun: false, pathEnv });
  assert.deepEqual(r.errors, []);

  // o9k artifacts gone
  assert.equal(fs.existsSync(path.join(tmp, ".agents/skills/o9k")), false);
  assert.equal(fs.existsSync(path.join(tmp, ".codex/skills/o9k-scout")), false);
  assert.equal(fs.existsSync(path.join(tmp, ".config/opencode/plugins/o9k.ts")), false);
  assert.equal(fs.existsSync(path.join(tmp, ".cursor/rules/o9k-using-o9k.mdc")), false);
  const codexWrappers = fs.existsSync(path.join(tmp, ".codex/hooks"))
    ? fs.readdirSync(path.join(tmp, ".codex/hooks")).filter((n) => n.startsWith("o9k-"))
    : [];
  assert.deepEqual(codexWrappers, []);

  // foreign content survives
  assert.ok(fs.statSync(foreignSkill).isDirectory());
  const strippedCodex = JSON.parse(fs.readFileSync(path.join(tmp, ".codex/hooks.json"), "utf8"));
  const blob = JSON.stringify(strippedCodex);
  assert.ok(blob.includes("echo foreign"));
  assert.ok(!blob.includes("o9k-core-session"));

  // hermes config stripped of o9k lines but file intact
  const hermesYaml = fs.readFileSync(path.join(tmp, ".hermes/config.yaml"), "utf8");
  assert.ok(!/o9k-/.test(hermesYaml));

  // doctor after uninstall: nothing of ours left ("foreign" = the user's own
  // o9k-my-own-skill dir, which uninstall correctly kept and doctor lists)
  const post = doctor({ home: tmp, pathEnv });
  assert.equal(
    post.artifacts.filter((a) => a.state !== "missing" && a.state !== "foreign").length,
    0
  );
  assert.deepEqual(post.problems.filter((p) => !p.startsWith("skills out of sync")), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor: no statusline artifacts on a host that was never wired", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  const r = doctor({ home: tmp, pathEnv });
  assert.equal(r.artifacts.some((a) => a.kind === "statusline"), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor: a foreign statusLine command is none of o9k's business", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  fs.writeFileSync(
    path.join(tmp, ".cursor/cli-config.json"),
    JSON.stringify({ statusLine: { type: "command", command: "echo foreign" } }, null, 2)
  );
  const r = doctor({ home: tmp, pathEnv });
  assert.equal(r.artifacts.some((a) => a.kind === "statusline"), false);
  assert.deepEqual(r.problems.filter((p) => !p.startsWith("skills out of sync")), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor: legacy o9k statusLine is reported but not a problem while the script exists", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  writeLegacyStatusLine(path.join(tmp, ".cursor/cli-config.json"), LIVE_STATUSLINE_SCRIPT);
  const r = doctor({ home: tmp, pathEnv });
  const artifact = r.artifacts.find((a) => a.kind === "statusline" && a.host === "cursor");
  assert.equal(artifact.state, "legacy");
  assert.deepEqual(r.problems.filter((p) => !p.startsWith("skills out of sync")), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor: legacy statusLine pointing at a moved clone is a problem", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  writeLegacyStatusLine(
    path.join(tmp, ".claude/settings.json"),
    "/gone/plugins/o9k-core/scripts/statusline/o9k-statusline.mjs"
  );
  const r = doctor({ home: tmp, pathEnv });
  const artifact = r.artifacts.find((a) => a.kind === "statusline" && a.host === "claude");
  assert.equal(artifact.state, "legacy");
  assert.ok(r.problems.some((p) => p.includes("claude") && p.includes("missing o9k script")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor: unpatched hermes cli.py produces no statusline noise", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  fs.mkdirSync(path.join(tmp, ".hermes/hermes-agent"), { recursive: true });
  fs.writeFileSync(path.join(tmp, ".hermes/hermes-agent/cli.py"), FIXTURE_CLI_PY);
  const r = doctor({ home: tmp, pathEnv });
  assert.equal(r.artifacts.some((a) => a.kind === "statusline"), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("doctor: a leftover hermes cli.py patch is flagged for removal", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  fs.mkdirSync(path.join(tmp, ".hermes/hermes-agent"), { recursive: true });
  fs.writeFileSync(path.join(tmp, ".hermes/hermes-agent/cli.py"), legacyPatchedCliPy());
  const r = doctor({ home: tmp, pathEnv });
  const artifact = r.artifacts.find((a) => a.kind === "statusline" && a.host === "hermes");
  assert.equal(artifact.state, "legacy");
  assert.ok(r.problems.some((p) => p.includes("hermes") && p.includes("older version")));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("unpatchCliPySource round-trips the legacy patch back to the original", () => {
  const patched = legacyPatchedCliPy();
  assert.notEqual(patched, FIXTURE_CLI_PY); // fixture really is patched
  const { source, changed } = unpatchCliPySource(patched);
  assert.equal(changed, true);
  assert.equal(source, FIXTURE_CLI_PY);
  // Idempotent: nothing left to remove the second time.
  assert.equal(unpatchCliPySource(source).changed, false);
});

test("uninstall strips only o9k-owned statusLine, leaves foreign intact", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  writeLegacyStatusLine(path.join(tmp, ".cursor/cli-config.json"), LIVE_STATUSLINE_SCRIPT);
  fs.writeFileSync(
    path.join(tmp, ".claude/settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "echo foreign" } }, null, 2)
  );

  const r = uninstall({ home: tmp, dryRun: false, pathEnv });
  assert.deepEqual(r.errors, []);

  const cursorCfg = JSON.parse(fs.readFileSync(path.join(tmp, ".cursor/cli-config.json"), "utf8"));
  assert.equal(cursorCfg.statusLine, undefined);

  const claudeCfg = JSON.parse(fs.readFileSync(path.join(tmp, ".claude/settings.json"), "utf8"));
  assert.equal(claudeCfg.statusLine.command, "echo foreign");

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("uninstall dry-run leaves statusLine untouched", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  writeLegacyStatusLine(path.join(tmp, ".claude/settings.json"), LIVE_STATUSLINE_SCRIPT);
  const before = fs.readFileSync(path.join(tmp, ".claude/settings.json"), "utf8");

  const r = uninstall({ home: tmp, dryRun: true, pathEnv });
  assert.ok(r.changedFiles.includes(path.join(tmp, ".claude/settings.json")));
  assert.equal(fs.readFileSync(path.join(tmp, ".claude/settings.json"), "utf8"), before);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("uninstall removes hermes statusline script and unpatches cli.py, keeps foreign patch", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  fs.mkdirSync(path.join(tmp, ".hermes/hermes-agent"), { recursive: true });
  const foreignFixture = FIXTURE_CLI_PY.replace(
    "    @staticmethod\n    def _status_bar_display_width(text: str) -> int:",
    `    def _get_tim_status(self):
        return {}

    @staticmethod
    def _status_bar_display_width(text: str) -> int:`
  );
  fs.writeFileSync(path.join(tmp, ".hermes/hermes-agent/cli.py"), legacyPatchedCliPy(foreignFixture));
  const scriptPath = path.join(tmp, ".hermes/agent-hooks/hermes-o9k-statusline.sh");
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, "#!/usr/bin/env bash\n");

  const r = uninstall({ home: tmp, dryRun: false, pathEnv });
  assert.deepEqual(r.errors, []);
  assert.equal(fs.existsSync(scriptPath), false);

  const cliBody = fs.readFileSync(path.join(tmp, ".hermes/hermes-agent/cli.py"), "utf8");
  assert.doesNotMatch(cliBody, /_get_o9k_status/);
  assert.match(cliBody, /_get_tim_status/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("uninstall mentions the .o9k-bak hint when a statusline backup exists", () => {
  const { tmp, pathEnv } = makeStatuslineHome();
  writeLegacyStatusLine(path.join(tmp, ".cursor/cli-config.json"), LIVE_STATUSLINE_SCRIPT);
  // The old wiring rolled a backup when it overwrote a foreign command.
  const bak = path.join(tmp, ".cursor/cli-config.json.o9k-bak");
  fs.writeFileSync(
    bak,
    JSON.stringify({ statusLine: { type: "command", command: "echo old" } }, null, 2)
  );

  const r = uninstall({ home: tmp, dryRun: false, pathEnv });
  assert.ok(r.manual.some((m) => m.includes(bak)));
  // Not auto-restored — bak still there, untouched, current file still ours-stripped.
  assert.ok(fs.existsSync(bak));

  fs.rmSync(tmp, { recursive: true, force: true });
});
