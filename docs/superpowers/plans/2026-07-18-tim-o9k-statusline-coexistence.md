# TIM ↔ o9k Statusline Coexistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect TIM-owned host statuslines in `/o9k-init`, migrate (remove / keep-with-warn / abort), and doctor-flag stray TIM or Hermes TIM+o9k stacks — without silently stripping TIM outside Init.

**Architecture:** New helpers under `plugins/o9k-core/scripts/statusline/` (`detect-tim.mjs`, `strip-tim.mjs`, `migrate.mjs`). Doctor extends existing statusline checks. Init skill documents the A/B/C interview and calls migrate + wire-all. TIM auto-wire deferral is **out of scope** (separate TIM PR).

**Tech Stack:** Node ≥18 ESM, `node --test`, reuse `writeFileWithBackup` / `readJsonSafe` from `hosts/common.mjs`, Hermes unpatch patterns inspired by `wire-hermes.mjs` (TIM blocks are separate literals).

**Spec:** `docs/superpowers/specs/2026-07-18-tim-o9k-statusline-coexistence-design.md`

## File map

| Path | Responsibility |
|------|----------------|
| `plugins/o9k-core/scripts/statusline/detect-tim.mjs` | Marker helpers + `detectTimStatusline({ home })` |
| `plugins/o9k-core/scripts/statusline/detect-tim.test.mjs` | Hermetic detect tests |
| `plugins/o9k-core/scripts/statusline/strip-tim.mjs` | Strip TIM-only wiring (Claude/Cursor/Hermes) |
| `plugins/o9k-core/scripts/statusline/strip-tim.test.mjs` | Strip + leave foreign/o9k alone |
| `plugins/o9k-core/scripts/statusline/migrate.mjs` | `migrateTimStatusline({ home, action, marketplaceRoot, elements, dryRun })` |
| `plugins/o9k-core/scripts/statusline/migrate.test.mjs` | Actions A/B/C + Hermes stack |
| `plugins/o9k-core/scripts/o9k-doctor.mjs` | TIM stray + Hermes stack problems |
| `plugins/o9k-core/scripts/o9k-doctor-uninstall.test.mjs` | Doctor TIM/Hermes cases |
| `plugins/o9k-core/skills/o9k-init/SKILL.md` | Interview A/B/C + execute steps |
| `CHANGELOG.md` | Unreleased note |

## Global constraints

- Strip **only** TIM-owned markers — never foreign non-TIM, never o9k (`o9k-statusline`, `_get_o9k_status`, `hermes-o9k-statusline.sh`).
- No TIM strip from `refresh-hosts`, SessionStart, or uninstall (uninstall already leaves TIM alone).
- v1 marker list is substring-based (open point #1) — expand later without API change.
- Hermes Action B: allow stack; return `warnings: ["hermes: TIM+o9k prefixes may stack"]`; doctor must flag afterward.

---

### Task 1: Detect TIM statusline

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/detect-tim.mjs`
- Create: `plugins/o9k-core/scripts/statusline/detect-tim.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test plugins/o9k-core/scripts/statusline/detect-tim.test.mjs
```

- [ ] **Step 3: Implement detect-tim.mjs**

```js
// detect-tim.mjs — identify TIM-owned host statusline wiring.
import fs from "node:fs";
import path from "node:path";
import { readJsonSafe } from "../hosts/common.mjs";

/** Substring markers — v1 list; expand without changing call sites. */
export const TIM_COMMAND_MARKERS = [
  "tim-statusline",
  "tim statusline",
  "tim-hooks",
  "tim-hermes-statusline",
  "packages/tim-hooks/scripts/tim-statusline",
];

export function isTimStatuslineCommand(cmd) {
  if (typeof cmd !== "string" || !cmd) return false;
  const lower = cmd.toLowerCase();
  // Never classify o9k as TIM even if a path oddly contains "tim"
  if (lower.includes("o9k-statusline")) return false;
  return TIM_COMMAND_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

export function detectTimStatusline({ home }) {
  const claudeCmd = readJsonSafe(path.join(home, ".claude/settings.json"))?.statusLine?.command;
  const cursorCmd = readJsonSafe(path.join(home, ".cursor/cli-config.json"))?.statusLine?.command;
  const claude = isTimStatuslineCommand(claudeCmd);
  const cursor = isTimStatuslineCommand(cursorCmd);

  let hermes = false;
  const script = path.join(home, ".hermes/agent-hooks/tim-hermes-statusline.sh");
  const cliPath = path.join(home, ".hermes/hermes-agent/cli.py");
  if (fs.existsSync(script)) hermes = true;
  try {
    if (fs.readFileSync(cliPath, "utf8").includes("_get_tim_status")) hermes = true;
  } catch {
    // missing cli.py
  }

  return { claude, cursor, hermes, any: claude || cursor || hermes };
}
```

- [ ] **Step 4: PASS + commit**

```bash
git add plugins/o9k-core/scripts/statusline/detect-tim.mjs plugins/o9k-core/scripts/statusline/detect-tim.test.mjs
git commit -m "feat(statusline): detect TIM-owned host statusline wiring"
```

---

### Task 2: Strip TIM wiring

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/strip-tim.mjs`
- Create: `plugins/o9k-core/scripts/statusline/strip-tim.test.mjs`

- [ ] **Step 1: Failing tests**

```js
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
  // Minimal fixture: TIM method + o9k method markers
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
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement strip-tim.mjs**

Use `writeFileWithBackup` for JSON and cli.py. For Hermes TIM removal:

- Delete `tim-hermes-statusline.sh` if present.
- Remove `_get_tim_status` method with a conservative regex (method def through next `def ` at same indent or class end). Prefer a small exported `stripTimFromCliPy(source) → { source, changed }` that removes:
  - `def _get_tim_status...` block (same style as TIM install — if exact block unknown, remove from `def _get_tim_status` until the next `\n    def `).
  - Lines referencing `tim_prefix` / `_get_tim_status()` in status-bar construction if present as obvious TIM splices.
- Do **not** call `unpatchCliPySource` (that removes o9k).

Claude/Cursor: if `isTimStatuslineCommand(cmd)`, delete `statusLine` key, write backup.

Return shape:

```js
{
  claude: { stripped: boolean, detail: string },
  cursor: { stripped: boolean, detail: string },
  hermes: { stripped: boolean, detail: string },
}
```

- [ ] **Step 4: PASS + commit**

```bash
git commit -m "feat(statusline): strip TIM-owned host statusline wiring"
```

---

### Task 3: migrate.mjs (Actions A/B/C)

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/migrate.mjs`
- Create: `plugins/o9k-core/scripts/statusline/migrate.test.mjs`

- [ ] **Step 1: Failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateTimStatusline } from "./migrate.mjs";
import { loadConfig } from "./config.mjs";

const marketplaceRoot = path.join(fileURLToPath(new URL("../../..", import.meta.url)));

test("action C aborts — no config, no wire", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mg-"));
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

test("action A strips TIM Claude then wires o9k", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mg-"));
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
  const cmd = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"))
    .statusLine.command;
  assert.match(cmd, /o9k-statusline/);
  const cfg = loadConfig();
  assert.equal(cfg.enabled, true);
  assert.ok(cfg.elements.includes("tim"));
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});

test("action B on Claude keeps TIM command and skips o9k wire for claude", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mg-"));
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
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});

test("action B on Hermes stacks TIM+o9k and returns warning", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mg-"));
  const hooks = path.join(home, ".hermes/agent-hooks");
  const agent = path.join(home, ".hermes/hermes-agent");
  fs.mkdirSync(hooks, { recursive: true });
  fs.mkdirSync(agent, { recursive: true });
  fs.writeFileSync(path.join(hooks, "tim-hermes-statusline.sh"), "#!/bin/bash\n");
  // Fixture must include anchors required by wireHermesStatusline — reuse the
  // same minimal anchors as wire-hermes.test.mjs (copy the fixture builder or
  // inline the strings that patchCliPySource expects).
  fs.writeFileSync(path.join(agent, "cli.py"), HERMES_FIXTURE_WITH_TIM); // define in test file
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
  delete process.env.O9K_STATUSLINE;
  fs.rmSync(home, { recursive: true, force: true });
});
```

Copy `HERMES_FIXTURE_WITH_TIM` from `wire-hermes.test.mjs` fixture (vanilla anchors + `_get_tim_status` method already inserted).

- [ ] **Step 2: Implement migrate.mjs**

```js
// migrate.mjs — Init Actions A/B/C for TIM ↔ o9k statusline.
import { defaultConfig, saveConfig } from "./config.mjs";
import { detectTimStatusline } from "./detect-tim.mjs";
import { stripTimStatusline } from "./strip-tim.mjs";
import { wireAllStatusline } from "./wire-all.mjs";
import { isTimStatuslineCommand } from "./detect-tim.mjs";
import { readJsonSafe } from "../hosts/common.mjs";
import path from "node:path";

/**
 * @param {"remove-tim"|"keep-tim"|"abort"} action
 */
export function migrateTimStatusline({
  home,
  marketplaceRoot,
  action,
  elements,
  hostsPresent = { claude: true, cursor: true, hermes: true },
  dryRun = false,
}) {
  if (action === "abort") {
    return { aborted: true, detect: detectTimStatusline({ home }), warnings: [] };
  }

  const detect = detectTimStatusline({ home });
  const warnings = [];
  let stripResults = null;

  if (action === "remove-tim") {
    stripResults = stripTimStatusline({ home, dryRun });
  }

  // Build per-host wire modes
  const hosts = {};
  for (const h of ["claude", "cursor", "hermes"]) {
    if (!hostsPresent[h]) {
      hosts[h] = { mode: "skip" };
      continue;
    }
    if (action === "keep-tim") {
      if (h === "claude" || h === "cursor") {
        const settings =
          h === "claude"
            ? path.join(home, ".claude/settings.json")
            : path.join(home, ".cursor/cli-config.json");
        const cmd = readJsonSafe(settings)?.statusLine?.command;
        if (isTimStatuslineCommand(cmd)) {
          hosts[h] = { mode: "keep" }; // do not overwrite TIM
          continue;
        }
      }
      if (h === "hermes" && detect.hermes) {
        warnings.push("hermes: TIM+o9k prefixes may stack in the TUI status bar");
      }
    }
    hosts[h] = { mode: "replace" };
  }

  if (!dryRun) {
    saveConfig(defaultConfig({ elements, enabled: true }));
  }

  const wireResults = wireAllStatusline({ home, marketplaceRoot, hosts, dryRun });
  return { aborted: false, detect, stripResults, wireResults, warnings };
}
```

Ensure `wire-all` `keep` mode already skips overwrite for Claude/Cursor when foreign (including TIM) — already true from Task 6 of statusline plan. For Hermes `keep` currently skips o9k patch if foreign present — **Action B needs Hermes `replace`** so o9k stacks. Spec: Hermes under B applies o9k alongside TIM.

**Important:** In the hosts loop above, for Hermes + `keep-tim` + `detect.hermes`, use `{ mode: "replace" }` (not keep), and only add the warning. Claude/Cursor use `{ mode: "keep" }` when TIM command present.

Fix the snippet accordingly when implementing (do not use hermes keep for Action B).

- [ ] **Step 3: PASS + commit**

```bash
git commit -m "feat(statusline): migrate TIM bar via Init actions A/B/C"
```

---

### Task 4: Doctor — TIM stray + Hermes stack

**Files:**
- Modify: `plugins/o9k-core/scripts/o9k-doctor.mjs`
- Modify: `plugins/o9k-core/scripts/o9k-doctor-uninstall.test.mjs`

- [ ] **Step 1: Add failing tests**

```js
test("doctor: TIM Claude command while o9k statusline enabled is a problem", () => {
  // enabled config, hosts.claude true, settings statusLine = tim-statusline.sh
  // expect problems matching /TIM statusline still wired/
});

test("doctor: Hermes TIM+o9k stack is a problem", () => {
  // enabled, hosts.hermes true, cli.py has _get_tim_status AND _get_o9k_status
  // expect /stacked/
});

test("doctor: o9k-only Hermes is clean for TIM stack check", () => {
  // only _get_o9k_status → no TIM stack problem (may still be ok overall)
});

test("doctor: TIM Hermes markers with o9k enabled and hermes host expected", () => {
  // _get_tim_status only, hosts.hermes true, enabled → problem (TIM still owning bar)
});
```

- [ ] **Step 2: Extend doctor**

In `checkStatuslineCommandHost`, after detecting non-o9k `cmd`:

```js
import { isTimStatuslineCommand } from "./statusline/detect-tim.mjs";

if (isTimStatuslineCommand(cmd)) {
  artifacts.push({ kind: "statusline", host: hostId, path: settingsPath, state: "tim" });
  problems.push(
    `TIM statusline still wired on ${hostId}; re-run /o9k-init migrate or remove manually: ${settingsPath}`,
  );
  return;
}
// existing foreign handling...
```

In `checkStatuslineHermes`:

```js
let source = "";
try { source = fs.readFileSync(cliPath, "utf8"); } catch { /* */ }
const hasTim = source.includes("_get_tim_status") ||
  fs.existsSync(path.join(home, ".hermes/agent-hooks/tim-hermes-statusline.sh"));
const hasO9k = source.includes("_get_o9k_status");

if (hasTim && hasO9k) {
  problems.push(
    `TIM+o9k Hermes statusline stacked; re-run /o9k-init Action A or remove TIM patch: ${cliPath}`,
  );
}
if (wireHosts?.hermes && hasTim && !hasO9k) {
  problems.push(
    `TIM statusline still wired on hermes; re-run /o9k-init migrate or remove manually: ${cliPath}`,
  );
}
// existing missing o9k check when wireHosts.hermes && !hasO9k...
```

Also run TIM checks when statusline enabled even if `wireHosts.claude` is false? Spec: “where o9k statusline is enabled / config.hosts says wired”. For Claude TIM stray: if enabled and TIM command present → always problem (user opted into o9k). Prefer: if `statusline.enabled` and TIM marker on Claude/Cursor → problem regardless of hosts flag (stray TIM after partial migrate).

- [ ] **Step 3: PASS + commit**

```bash
git commit -m "feat(statusline): doctor flags TIM stray and Hermes TIM+o9k stack"
```

---

### Task 5: o9k-init skill interview

**Files:**
- Modify: `plugins/o9k-core/skills/o9k-init/SKILL.md`

- [ ] **Step 1: Extend Statusline section**

After Skip/Yes, insert:

```markdown
   - **Detect TIM bar** (read-only) before wiring:
     `node -e` or small helper printing JSON from
     `detectTimStatusline({ home: process.env.HOME })`.
   - If **Skip** and TIM detected: optional one-liner
     *"TIM statusline still active — left untouched."*
   - If **Yes** and TIM detected — ask **one** of:
     - **A. Remove TIM host wiring, install o9k** (default / recommend)
     - **B. Keep TIM wiring and install o9k** (warn: Claude/Cursor keep TIM
       command = skip o9k on that host; Hermes may stack prefixes — doctor
       will flag stacks)
     - **C. Abort o9k statusline** — leave TIM as-is
   - Preselect element `tim` when TIM bar or `tim` CLI is present.
   - Execute via:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/statusline/migrate.mjs" \
       --action remove-tim|keep-tim|abort \
       --elements tim,model,... \
       --marketplace "$MARKET" \
       --hosts-present claude,cursor,hermes
     ```
     (`migrate.mjs` CLI wraps `migrateTimStatusline`; print JSON result + warnings)
```

Update Step 5 §6 Statusline execute block to call `migrate.mjs` when TIM was detected; otherwise existing `saveConfig` + `wire-all` path is fine (or always use migrate with action remove-tim when no TIM — migrate should no-op strip).

Simplest rule for skill: **always** use `migrate.mjs` for Yes path:
- no TIM → `--action remove-tim` (strip no-ops) then wire
- TIM + A/B/C → as chosen

- [ ] **Step 2: Add CLI to migrate.mjs** if missing (`--action`, `--elements`, `--marketplace`, `--home`, `--hosts-present`, `--dry-run`) — parse and `console.log(JSON.stringify(result, null, 2))`.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(o9k-init): TIM statusline migrate interview A/B/C"
```

---

### Task 6: CHANGELOG + verify TIM follow-up

**Files:**
- Modify: `CHANGELOG.md`
- Create (optional short pointer): `docs/superpowers/plans/2026-07-18-tim-statusline-defer-o9k.md` **or** a one-line Idea note — prefer a stub plan in o9k docs that says “implement in TIM repo: skip auto-wire when ~/.o9k exists”.

- [ ] **Step 1: CHANGELOG Unreleased**

```markdown
### Added
- `/o9k-init` migrates TIM host statuslines (detect / remove / keep-with-warn / abort);
  doctor flags stray TIM wiring and Hermes TIM+o9k stacks.
```

- [ ] **Step 2: Stub TIM follow-up doc** (o9k docs only — no TIM code in this plan)

`docs/superpowers/plans/2026-07-18-tim-statusline-defer-followup.md`:

```markdown
# TIM follow-up: defer statusline auto-wire when o9k present

Out of scope for o9k coexistence PR. Implement in `~/projects/tim`:

1. In `setup-agent` / Hermes statusline install: if `~/.o9k` exists OR
   o9k marketplace/plugin detected → skip auto-wire; print
   "Use /o9k-init statusline (element tim)".
2. Keep `tim statusline` + `tim setup-hermes-statusline` for TIM-only.
3. Changelog entry in TIM.
```

- [ ] **Step 3: Full test suite**

```bash
find plugins -type f -name '*.test.mjs' | sort | xargs node --test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: changelog + TIM statusline defer follow-up stub"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Detect TIM Claude/Cursor/Hermes | 1 |
| Action A strip + wire | 2, 3 |
| Action B Claude keep / Hermes stack + warning | 3 |
| Action C abort | 3 |
| Doctor Claude TIM + Hermes stack/TIM-only | 4 |
| Init interview in o9k-init | 5 |
| No silent strip outside Init | 2–5 (skill hard rules) |
| TIM auto-wire defer | 6 stub only |

## Self-review

- Hermes Action B uses `replace` for o9k wire (stack), not `keep` — called out in Task 3.
- Doctor asymmetry from review closed in Task 4.
- Marker regex v1 substring list — expandable (open point #1).
- No TIM repo edits in this plan.
