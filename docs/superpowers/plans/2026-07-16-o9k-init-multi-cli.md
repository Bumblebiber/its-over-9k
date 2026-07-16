# o9k-init multi-CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/o9k-init` so it detects Claude, Codex, Cursor, OpenCode, and Hermes, syncs shared o9k skills, and wires Claude-parity hooks on every present host (marketplace/plugin first where ready, symlink/merge fallback otherwise).

**Architecture:** Registry-driven host metadata + `detectHosts()` feed the init snapshot. `skills-sync.mjs` installs skills under `~/.agents/skills/o9k/` and symlinks into host skill dirs (Cursor Rules fallback). `host-wire.mjs` installs thin adapters that invoke existing `session-start.mjs` / `pre-compact.mjs` / `update-check.mjs` (core + memory). Claude keeps marketplace pillars; other hosts use native plugin install when packaged, else config merge.

**Tech Stack:** Node.js (zero deps, `node:test`), existing o9k-core/o9k-memory scripts, host config formats (JSON / YAML / OpenCode TS plugin).

## Global Constraints

- Public memory default remains **hmem** until TIM 1.0; if TIM is already detected, prefer wiring TIM and do not install hmem unless asked.
- Detect before ask; only wire **present** hosts; never install missing CLI binaries.
- Prefer marketplace/plugin install when the host supports a real package; symlinks/merges are fallback.
- Idempotent re-runs; own only `o9k-` prefixed paths/entries; never delete third-party hooks.
- Per-host failure must not abort other hosts; snapshot records `fail:<reason>`.
- Zero new runtime npm dependencies in o9k plugins.
- Spec: `docs/superpowers/specs/2026-07-16-o9k-init-multi-cli-design.md`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `plugins/o9k-core/compat/registry.json` | Add `hosts` map (bin, homeRel, skillDirRel, hooksRel, mcpRel, wireMode) |
| `plugins/o9k-core/scripts/detect.mjs` | `detectHosts()`, host status helpers |
| `plugins/o9k-core/scripts/o9k-init.mjs` | Print `Hosts:` snapshot section |
| `plugins/o9k-core/scripts/skills-sync.mjs` | Canonical skill install + host symlinks / Cursor rules |
| `plugins/o9k-core/scripts/hook-merge.mjs` | Idempotent JSON hook merge for Claude-like / Cursor / Codex shapes |
| `plugins/o9k-core/scripts/host-wire.mjs` | Orchestrate per-host wire + verify; CLI `--dry-run` / `--run` |
| `plugins/o9k-core/hooks/adapters/run-o9k-hook.sh` | Shared shell wrapper: set `CLAUDE_PLUGIN_ROOT`, run named script |
| `plugins/o9k-core/hooks/adapters/opencode-o9k.ts` | OpenCode plugin: session.created (+ compact if available) → Node scripts |
| `plugins/o9k-core/hooks/adapters/hermes-o9k-*.sh` | Hermes agent-hook wrappers |
| `plugins/o9k-core/skills/o9k-init/SKILL.md` | Multi-CLI detect / sync / wire / verify steps |
| `plugins/o9k-core/scripts/*.test.mjs` | `node:test` unit tests |
| `docs/hosts/PLUGIN-PACKAGING.md` | Spike notes for Codex/Hermes marketplace packaging (follow-up) |
| `CHANGELOG.md` | User-facing note |

---

### Task 1: Host registry + `detectHosts()`

**Files:**
- Modify: `plugins/o9k-core/compat/registry.json`
- Modify: `plugins/o9k-core/scripts/detect.mjs`
- Create: `plugins/o9k-core/scripts/detect-hosts.test.mjs`

**Interfaces:**
- Consumes: `loadRegistry()`, `onPath` pattern in `detect.mjs`
- Produces:
  ```ts
  // HostId = "claude" | "codex" | "cursor" | "opencode" | "hermes"
  type HostInfo = {
    id: string;
    label: string;
    present: boolean;       // bin OR homeDir
    bin: boolean;
    home: boolean;
    homeDir: string | null;
    skillDir: string | null;
    hooksPath: string | null;
    mcpPath: string | null;
    wireMode: "claude-plugin" | "hooks-json" | "cursor-hooks" | "opencode-plugin" | "hermes-yaml";
  };
  export function detectHosts(options?: { home?: string }): Record<string, HostInfo>;
  export function listHostDefs(): Array<{ id: string; label: string; ... }>;
  ```

- [ ] **Step 1: Write the failing test**

Create `plugins/o9k-core/scripts/detect-hosts.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectHosts } from "./detect.mjs";

test("detectHosts marks present when home dir exists even without bin", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-hosts-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  const hosts = detectHosts({ home: tmp });
  assert.equal(hosts.codex.present, true);
  assert.equal(hosts.codex.home, true);
  assert.equal(hosts.claude.present, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("detectHosts resolves skillDir and hooksPath under home", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-hosts-"));
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  const hosts = detectHosts({ home: tmp });
  assert.equal(hosts.cursor.skillDir, null); // Cursor: no writable skills dir in registry
  assert.ok(hosts.cursor.hooksPath.endsWith(path.join(".cursor", "hooks.json")));
  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/o9k-core/scripts/detect-hosts.test.mjs`  
Expected: FAIL (`detectHosts` is not exported)

- [ ] **Step 3: Add `hosts` to registry.json**

Append (sibling of `frameworks` / `bundles`):

```json
"hosts": {
  "claude": {
    "label": "Claude Code",
    "bin": ["claude"],
    "homeRel": ".claude",
    "skillDirRel": ".claude/skills",
    "hooksRel": ".claude/settings.json",
    "mcpRel": ".claude.json",
    "wireMode": "claude-plugin"
  },
  "codex": {
    "label": "Codex",
    "bin": ["codex"],
    "homeRel": ".codex",
    "skillDirRel": ".codex/skills",
    "hooksRel": ".codex/hooks.json",
    "mcpRel": ".codex/config.toml",
    "wireMode": "hooks-json"
  },
  "cursor": {
    "label": "Cursor",
    "bin": ["cursor-agent", "agent"],
    "homeRel": ".cursor",
    "skillDirRel": null,
    "rulesRel": ".cursor/rules",
    "hooksRel": ".cursor/hooks.json",
    "mcpRel": ".cursor/mcp.json",
    "wireMode": "cursor-hooks"
  },
  "opencode": {
    "label": "OpenCode",
    "bin": ["opencode"],
    "homeRel": ".config/opencode",
    "skillDirRel": ".config/opencode/skills",
    "hooksRel": ".config/opencode/plugins",
    "mcpRel": ".config/opencode/opencode.json",
    "wireMode": "opencode-plugin"
  },
  "hermes": {
    "label": "Hermes",
    "bin": ["hermes"],
    "homeRel": ".hermes",
    "skillDirRel": ".hermes/skills",
    "hooksRel": ".hermes/config.yaml",
    "mcpRel": null,
    "wireMode": "hermes-yaml"
  }
}
```

- [ ] **Step 4: Implement `detectHosts` in detect.mjs**

```js
export function listHostDefs() {
  const hosts = loadRegistry().hosts || {};
  return Object.entries(hosts).map(([id, h]) => ({ id, ...h }));
}

export function detectHosts(options = {}) {
  const home = options.home || os.homedir();
  const out = {};
  for (const def of listHostDefs()) {
    const bin = (def.bin || []).some((b) => onPath(b));
    const homeDir = def.homeRel ? path.join(home, def.homeRel) : null;
    const homeOk = !!(homeDir && fs.existsSync(homeDir));
    const joinRel = (rel) => (rel ? path.join(home, rel) : null);
    out[def.id] = {
      id: def.id,
      label: def.label || def.id,
      present: bin || homeOk,
      bin,
      home: homeOk,
      homeDir: homeOk ? homeDir : null,
      skillDir: joinRel(def.skillDirRel),
      hooksPath: joinRel(def.hooksRel),
      mcpPath: def.mcpRel
        ? def.mcpRel.endsWith(".claude.json")
          ? path.join(home, ".claude.json")
          : path.join(home, def.mcpRel)
        : null,
      wireMode: def.wireMode,
      rulesDir: joinRel(def.rulesRel),
    };
  }
  return out;
}
```

Fix `mcpRel` for Claude: use `".claude.json"` at home root — in registry set `"mcpRel": ".claude.json"` and join as `path.join(home, def.mcpRel)` for all (drop special case).

- [ ] **Step 5: Run tests — expect PASS**

Run: `node --test plugins/o9k-core/scripts/detect-hosts.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add plugins/o9k-core/compat/registry.json plugins/o9k-core/scripts/detect.mjs plugins/o9k-core/scripts/detect-hosts.test.mjs
git commit -m "feat: detectHosts for multi-CLI o9k-init"
```

---

### Task 2: Snapshot `Hosts:` section in `o9k-init.mjs`

**Files:**
- Modify: `plugins/o9k-core/scripts/o9k-init.mjs`
- Create: `plugins/o9k-core/scripts/o9k-init-hosts.test.mjs` (spawn script with `HOME=tmp`)

**Interfaces:**
- Consumes: `detectHosts()` from Task 1
- Produces: stdout block:
  ```
  Hosts:
    Claude Code     present  skills=? hooks=? mcp=?
    ...
  ```
  For Task 2, skills/hooks/mcp may print `—` (unverified) until Task 9; use `present`/`absent` only:

  ```
  Hosts:
    Claude Code                          present
    Codex                                absent
  ```

- [ ] **Step 1: Write failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./o9k-init.mjs", import.meta.url));

test("o9k-init.mjs prints Hosts section", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-init-"));
  fs.mkdirSync(path.join(tmp, ".codex"));
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, HOME: tmp, CLAUDE_PLUGIN_ROOT: "" },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Hosts:/);
  assert.match(r.stdout, /Codex\s+present/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run — expect FAIL** (no `Hosts:` yet)

- [ ] **Step 3: Implement snapshot section**

In `o9k-init.mjs`, import `detectHosts` and after Essentials:

```js
const hosts = detectHosts();
console.log("");
console.log("Hosts:");
for (const h of Object.values(hosts)) {
  console.log(`  ${h.label.padEnd(36)} ${h.present ? "present" : "absent"}`);
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-core/scripts/o9k-init.mjs plugins/o9k-core/scripts/o9k-init-hosts.test.mjs
git commit -m "feat: o9k-init snapshot lists detected CLI hosts"
```

---

### Task 3: `skills-sync.mjs` (canonical + symlinks + Cursor rules)

**Files:**
- Create: `plugins/o9k-core/scripts/skills-sync.mjs`
- Create: `plugins/o9k-core/scripts/skills-sync.test.mjs`

**Interfaces:**
- Consumes: `detectHosts()`, pillar skill paths relative to repo `plugins/`
- Produces:
  ```ts
  export function syncSkills(options: {
    home?: string;
    pluginRoot?: string;       // o9k-core plugin root
    marketplaceRoot?: string;  // parent of o9k-* pillars (default pluginRoot/..)
    dryRun?: boolean;
  }): { canonical: string; linked: string[]; rules: string[]; errors: string[] };

  // Canonical: ~/.agents/skills/o9k/<skillName>/SKILL.md
  // Skill names to sync:
  const SKILL_SOURCES = [
    ["o9k-core", "using-o9k"],
    ["o9k-core", "o9k-init"],
    ["o9k-core", "o9k-guide"],
    ["o9k-core", "o9k-update"],
    ["o9k-core", "o9k-stats"],
    ["o9k-scout", "scout"],
    ["o9k-dispatch", "dispatch"],
    ["o9k-caveman", "caveman"],
    ["o9k-memory", "memory"],
  ];
  ```

- [ ] **Step 1: Write failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "./skills-sync.mjs";

const coreRoot = fileURLToPath(new URL("..", import.meta.url)); // plugins/o9k-core
const marketRoot = path.join(coreRoot, "..");

test("syncSkills writes canonical and symlinks into codex skills dir", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
  const r = syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.ok(fs.existsSync(path.join(tmp, ".agents/skills/o9k/scout/SKILL.md")));
  const link = path.join(tmp, ".codex/skills/scout");
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  // idempotent
  const r2 = syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.equal(r2.errors.length, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("syncSkills writes Cursor rules when skillDir is null", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-skills-"));
  fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true });
  syncSkills({ home: tmp, pluginRoot: coreRoot, marketplaceRoot: marketRoot });
  assert.ok(fs.existsSync(path.join(tmp, ".cursor/rules/o9k-using-o9k.mdc")));
  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `skills-sync.mjs`**

Logic:
1. Resolve each `SKILL_SOURCES` path: `marketplaceRoot/<pillar>/skills/<name>/SKILL.md`.
2. Copy (or symlink) into `home/.agents/skills/o9k/<name>/`.
3. For each **present** host with `skillDir`: `mkdir -p skillDir`; `ln -sfn` canonical skill dir → `skillDir/<name>` (skip if identical link exists).
4. For Cursor (`rulesDir`): write one `.mdc` per skill with frontmatter + body pointing at canonical path / embedding first ~80 lines of SKILL.md description — keep short: title + “read ~/.agents/skills/o9k/<name>/SKILL.md”.
5. Skip absent hosts. Collect errors per host without throwing.

CLI:

```js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry-run");
  const r = syncSkills({ dryRun: dry, pluginRoot: process.env.CLAUDE_PLUGIN_ROOT });
  console.log(JSON.stringify(r, null, 2));
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-core/scripts/skills-sync.mjs plugins/o9k-core/scripts/skills-sync.test.mjs
git commit -m "feat: skills-sync canonical o9k skills + host symlinks"
```

---

### Task 4: Shared hook adapter + JSON merge helper

**Files:**
- Create: `plugins/o9k-core/hooks/adapters/run-o9k-hook.sh`
- Create: `plugins/o9k-core/scripts/hook-merge.mjs`
- Create: `plugins/o9k-core/scripts/hook-merge.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export function mergeHooksJson(
    existing: object,
    patch: object,
    options?: { ownerPrefix?: string } // default "o9k-"
  ): object;
  // Removes previous entries whose command contains "/o9k-" or "run-o9k-hook.sh" before re-adding patch entries.
  ```

- [ ] **Step 1: Write failing test for merge idempotence**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeHooksJson } from "./hook-merge.mjs";

test("mergeHooksJson replaces prior o9k entries only", () => {
  const existing = {
    hooks: {
      SessionStart: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: "bash /tmp/foreign.sh" },
            { type: "command", command: "bash /x/run-o9k-hook.sh core-session" },
          ],
        },
      ],
    },
  };
  const patch = {
    hooks: {
      SessionStart: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "bash /new/run-o9k-hook.sh core-session" }],
        },
      ],
    },
  };
  const out = mergeHooksJson(existing, patch);
  const cmds = out.hooks.SessionStart[0].hooks.map((h) => h.command);
  assert.ok(cmds.some((c) => c.includes("foreign.sh")));
  assert.equal(cmds.filter((c) => c.includes("run-o9k-hook")).length, 1);
  assert.ok(cmds.some((c) => c.includes("/new/run-o9k-hook")));
});
```

Also add a Cursor-shape test (`version: 1`, `hooks.sessionStart: [{ command }]`) — either overload `mergeCursorHooks` in same file or detect shape by `version === 1`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `hook-merge.mjs` + `run-o9k-hook.sh`**

`run-o9k-hook.sh`:

```bash
#!/usr/bin/env bash
# Usage: run-o9k-hook.sh <core|memory>/<script-basename>
# Resolves O9K_MARKETPLACE_ROOT or walks from this file to plugins/.
set -euo pipefail
TARGET="${1:?target like core/session-start}"
ROOT="${O9K_MARKETPLACE_ROOT:-}"
if [[ -z "$ROOT" ]]; then
  ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"  # hooks/adapters -> o9k-core -> plugins
fi
case "$TARGET" in
  core/*)  SCRIPT="$ROOT/o9k-core/scripts/${TARGET#core/}.mjs"
           export CLAUDE_PLUGIN_ROOT="$ROOT/o9k-core" ;;
  memory/*) SCRIPT="$ROOT/o9k-memory/scripts/${TARGET#memory/}.mjs"
           export CLAUDE_PLUGIN_ROOT="$ROOT/o9k-memory" ;;
  *) echo "unknown target $TARGET" >&2; exit 1 ;;
esac
exec node "$SCRIPT"
```

Implement merge for Claude/Codex nested shape and Cursor flat `hooks.<event>: [{command}]` shape (export `mergeCursorHooksJson`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: `chmod +x` adapter + commit**

```bash
chmod +x plugins/o9k-core/hooks/adapters/run-o9k-hook.sh
git add plugins/o9k-core/hooks/adapters/run-o9k-hook.sh plugins/o9k-core/scripts/hook-merge.mjs plugins/o9k-core/scripts/hook-merge.test.mjs
git commit -m "feat: o9k hook adapter wrapper + idempotent hook merge"
```

---

### Task 5: Wire Codex hooks (fallback `hooks.json`)

**Files:**
- Create: `plugins/o9k-core/scripts/hosts/wire-codex.mjs`
- Create: `plugins/o9k-core/scripts/hosts/wire-codex.test.mjs`
- Create: `plugins/o9k-core/hooks/adapters/codex-o9k-session.sh` (optional thin wrapper calling `run-o9k-hook.sh`)

**Interfaces:**
- Produces: `export function wireCodex({ home, marketplaceRoot, dryRun }): { ok: boolean, detail: string }`
- Installs scripts into `~/.codex/hooks/o9k-*.sh` (symlink to adapters) and merges:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume",
      "hooks": [
        { "type": "command", "command": "bash <home>/.codex/hooks/o9k-core-session.sh", "timeout": 15 },
        { "type": "command", "command": "bash <home>/.codex/hooks/o9k-memory-session.sh", "timeout": 15 },
        { "type": "command", "command": "bash <home>/.codex/hooks/o9k-update-check.sh", "timeout": 20 }
      ]
    }],
    "PreCompact": [{
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "bash <home>/.codex/hooks/o9k-memory-precompact.sh", "timeout": 30 }
      ]
    }]
  }
}
```

If Codex rejects `PreCompact` at runtime, document in `detail` and keep entry — verification Task 9 notes it. Prefer trying PreCompact (parity).

- [ ] **Step 1: Failing test** — tmp HOME with `.codex`, call `wireCodex`, assert `hooks.json` contains `o9k-core-session` and foreign hook preserved

- [ ] **Step 2: Implement + PASS**

- [ ] **Step 3: Commit** `feat: wire o9k hooks into Codex hooks.json`

---

### Task 6: Wire Cursor hooks

**Files:**
- Create: `plugins/o9k-core/scripts/hosts/wire-cursor.mjs`
- Create: `plugins/o9k-core/scripts/hosts/wire-cursor.test.mjs`

**Interfaces:**
- `wireCursor({ home, marketplaceRoot, dryRun })`
- Merge into `~/.cursor/hooks.json` preserving `version: 1`:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "bash <home>/.cursor/hooks/o9k-core-session.sh", "timeout": 15 },
      { "command": "bash <home>/.cursor/hooks/o9k-memory-session.sh", "timeout": 15 },
      { "command": "bash <home>/.cursor/hooks/o9k-update-check.sh", "timeout": 20 }
    ],
    "preCompact": [
      { "command": "bash <home>/.cursor/hooks/o9k-memory-precompact.sh", "timeout": 30 }
    ]
  }
}
```

Symlink adapters into `~/.cursor/hooks/`.

- [ ] **Steps:** TDD same pattern as Task 5 → commit `feat: wire o9k hooks into Cursor hooks.json`

---

### Task 7: Wire OpenCode plugin adapter

**Files:**
- Create: `plugins/o9k-core/hooks/adapters/opencode-o9k.ts`
- Create: `plugins/o9k-core/scripts/hosts/wire-opencode.mjs`
- Create: `plugins/o9k-core/scripts/hosts/wire-opencode.test.mjs`

**Interfaces:**
- Preferred path: copy/symlink `opencode-o9k.ts` → `~/.config/opencode/plugins/o9k.ts`
- Later: `opencode plugin @bumblebiber/o9k -g` when published (guard with env `O9K_OPENCODE_NPM` or registry flag `hosts.opencode.npmPackage` — if set and `opencode` on PATH, try CLI first, else file drop)

`opencode-o9k.ts` sketch (match TIM plugin style):

```ts
import type { Hooks } from "@opencode-ai/plugin";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adaptersDir = path.dirname(fileURLToPath(import.meta.url));
// When installed into ~/.config/opencode/plugins/, resolve marketplace via O9K_MARKETPLACE_ROOT
const run = (target: string) => {
  const root = process.env.O9K_MARKETPLACE_ROOT || "";
  const sh = root
    ? path.join(root, "o9k-core/hooks/adapters/run-o9k-hook.sh")
    : path.join(adaptersDir, "run-o9k-hook.sh"); // if we also copy the shell next to the ts (prefer env)
  spawnSync("bash", [sh, target], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
};

export default async (): Promise<Hooks> => ({
  event: async ({ event }) => {
    if (event.type === "session.created") {
      // stdout from hooks may inject — call scripts; print useful stdout
      for (const t of ["core/session-start", "memory/session-start", "core/update-check"]) {
        const r = spawnSync("bash", [/* run-o9k-hook */, t], { encoding: "utf8" });
        if (r.stdout?.trim()) console.log(r.stdout.trim());
      }
    }
    // If OpenCode emits a compact event, map to memory/pre-compact — probe docs during implement;
    // if none, note in wire result detail "preCompact: unsupported".
  },
});
```

During implementation: confirm compact event name from OpenCode docs/`@opencode-ai/plugin` types; if absent, set `detail` accordingly (parity best-effort).

- [ ] **Steps:** TDD copy into tmp `plugins/o9k.ts` + write a marker file `O9K_MARKETPLACE_ROOT` in a small env file or embed absolute marketplace path resolved at wire time into a generated `o9k.ts` (preferred for reliability: **generate** the plugin file with `MARKETPLACE` const baked in).

- [ ] **Commit:** `feat: OpenCode o9k session plugin adapter`

---

### Task 8: Wire Hermes hooks (`config.yaml` + agent-hooks)

**Files:**
- Create: `plugins/o9k-core/scripts/hosts/wire-hermes.mjs`
- Create: `plugins/o9k-core/scripts/hosts/wire-hermes.test.mjs`
- Create: `plugins/o9k-core/hooks/adapters/hermes-o9k-session.sh`
- Create: `plugins/o9k-core/hooks/adapters/hermes-o9k-precompact.sh` (if Hermes has a compact/session-end equivalent use `on_session_end` only for cleanup — map pre-compact to nearest; if only `pre_llm_call`, run session hooks there and document precompact gap)

**Interfaces:**
- Symlink wrappers → `~/.hermes/agent-hooks/o9k-*.sh`
- Merge YAML under `hooks:` without wiping foreign entries. **Do not add a YAML dependency** — use line-oriented idempotent patch:
  - If `hooks:` missing, append a block.
  - If `pre_llm_call:` exists, ensure list entries for o9k scripts (match on `o9k-` basename).
  - Prefer implementing a minimal append/replace using regex on the `hooks:` section; tests cover round-trip on a fixture YAML copied from this machine’s shape.

Fixture for tests (minimal):

```yaml
hooks:
  pre_llm_call:
    - command: ~/.hermes/agent-hooks/foreign.sh
  on_session_end:
    - command: ~/.hermes/agent-hooks/foreign-end.sh
```

After wire, both foreign and `o9k-` commands present.

Marketplace path: if `hosts.hermes.pluginRepo` is set in registry later, try `hermes plugins install`; v1 leaves it unset and uses YAML fallback.

- [ ] **Steps:** TDD → commit `feat: wire o9k hooks into Hermes config.yaml`

---

### Task 9: `host-wire.mjs` orchestrator + rich Hosts snapshot

**Files:**
- Create: `plugins/o9k-core/scripts/host-wire.mjs`
- Modify: `plugins/o9k-core/scripts/o9k-init.mjs`
- Create: `plugins/o9k-core/scripts/host-wire.test.mjs`

**Interfaces:**
```ts
export function verifyHost(host: HostInfo, home: string): { skills: string; hooks: string; mcp: string };
export function wireHosts(options: { home?: string; marketplaceRoot: string; dryRun?: boolean; only?: string[] }):
  { results: Array<{ id: string; ok: boolean; detail: string }> };

// CLI: node host-wire.mjs --dry-run | --run [--only=codex,cursor]
```

Verify heuristics:
- `skills=yes` if canonical skill exists and (symlink in skillDir OR cursor rules file)
- `hooks=yes` if hooks file/plugin contains `o9k-` marker
- `mcp=yes` if mcp path exists and mentions `hmem` or `tim` (best-effort string search); else `no`/`?`

Claude `wireMode: claude-plugin`: host-wire **skips** hook merge (plugins own hooks); verify pillars via existing detect; still run skills-sync optional links.

- [ ] **Step 1: Tests** for orchestrator calling fake host modules OR integration with tmp dirs for codex+cursor

- [ ] **Step 2: Implement**

- [ ] **Step 3: Update `o9k-init.mjs` Hosts lines:**

```
  Codex                                present  skills=yes hooks=yes mcp=yes
```

- [ ] **Step 4: Commit** `feat: host-wire orchestrator + verified Hosts snapshot`

---

### Task 10: Update `/o9k-init` skill + CHANGELOG

**Files:**
- Modify: `plugins/o9k-core/skills/o9k-init/SKILL.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md` (short “Works with Claude, Codex, Cursor, OpenCode, Hermes” + pointer)

**Skill changes (exact flow inserts):**

After Step 1 detect command, document new Hosts section.

In Step 2 interview: add note — do not offer to install CLIs; if user says they use a tool marked absent, believe them and attempt wire anyway (`host-wire --only=…` after they create home dir / install bin).

In Step 5 execute, insert order:

```bash
# 1) memory (prefer detected backend)
#    if TIM detected: tim setup-agent --host <each present host>  (or tim init where it covers the host)
#    else: hmem init --global --tools <mapped list>
# 2) skills
node "${CLAUDE_PLUGIN_ROOT}/scripts/skills-sync.mjs"
# 3) hooks
node "${CLAUDE_PLUGIN_ROOT}/scripts/host-wire.mjs" --run
# 4) Claude pillars (unchanged)
claude plugin install …
# 5) companions bundle (unchanged)
```

Map hmem tool ids: `claude-code`, `cursor`, `opencode` (skip codex/hermes in hmem until upstream supports them — for those rely on `tim setup-agent` when TIM present, else MCP manual note in report).

- [ ] **Step 1: Edit skill + changelog**

- [ ] **Step 2: Bump `plugins/o9k-core/.claude-plugin/plugin.json` version** (e.g. 0.8.0) — multi-CLI is a minor feature bump

- [ ] **Step 3: Commit** `docs: o9k-init multi-CLI flow + changelog 0.8.0`

---

### Task 11: Plugin packaging follow-up doc + OpenCode npm stub decision

**Files:**
- Create: `docs/hosts/PLUGIN-PACKAGING.md`

Content must include concrete findings from a spike run during this task:

1. **Codex:** Run `codex plugin marketplace add` against a local folder scaffold; document required layout (or “not suitable for skills+hooks — keep hooks.json”). Record command transcript in the doc.
2. **Hermes:** Read one `plugin.yaml` example; state whether hooks can ship inside a Hermes plugin or must stay in `config.yaml`.
3. **OpenCode:** Prefer file drop now; note path to publish `opencode plugin -g` later (`package.json` name TBD).
4. **Cursor:** Explicit “no marketplace”.

If Codex/Hermes marketplace is viable in &lt;2h spike, add registry keys:

```json
"codex": { "pluginMarketplace": "...", "pluginName": "o9k" }
```

and a branch in `wire-codex.mjs` / `wire-hermes.mjs` that tries plugin install before fallback. If not viable, document and leave fallback as the supported path.

- [ ] **Step 1: Spike + write PLUGIN-PACKAGING.md**

- [ ] **Step 2: Commit** `docs: host plugin packaging spike for o9k multi-CLI`

---

### Task 12: End-to-end smoke on this machine

**Files:** none (manual / scripted smoke)

- [ ] **Step 1: Dry-run**

```bash
export CLAUDE_PLUGIN_ROOT=/home/bbbee/projects/o9k/plugins/o9k-core
export O9K_MARKETPLACE_ROOT=/home/bbbee/projects/o9k/plugins
node "$CLAUDE_PLUGIN_ROOT/scripts/o9k-init.mjs"
node "$CLAUDE_PLUGIN_ROOT/scripts/skills-sync.mjs" --dry-run
node "$CLAUDE_PLUGIN_ROOT/scripts/host-wire.mjs" --dry-run
```

Expected: all five hosts `present`; dry-run plans show actions.

- [ ] **Step 2: Run unit tests**

```bash
node --test plugins/o9k-core/scripts/*.test.mjs plugins/o9k-core/scripts/hosts/*.test.mjs
```

Expected: all PASS

- [ ] **Step 3: Optional live wire** (only with user approval — mutates `~/.codex`, `~/.cursor`, etc.)

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/skills-sync.mjs"
node "$CLAUDE_PLUGIN_ROOT/scripts/host-wire.mjs" --run
node "$CLAUDE_PLUGIN_ROOT/scripts/o9k-init.mjs"
```

Expected: Hosts lines show `skills=yes hooks=yes` for wired hosts; foreign hooks still present in configs.

- [ ] **Step 4: Commit any smoke fixes** if needed

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Detect CLIs | T1 |
| Snapshot hosts | T2, T9 |
| Shared skills + symlinks | T3 |
| Cursor Rules fallback | T3 |
| Hook parity core+memory+update | T4–T8 |
| Marketplace preference | T7 (OpenCode), T11 (spike), Claude unchanged T10 |
| Memory hmem default / TIM prefer | T10 |
| Idempotent / no foreign delete | T4–T8 tests |
| host-wire failures isolated | T9 |
| Skill flow update | T10 |
| Packaging follow-ups | T11 |
| Tests | T1–T9, T12 |

No TBD placeholders left in task steps. Types/names consistent: `detectHosts`, `syncSkills`, `wireCodex`/`wireCursor`/`wireOpencode`/`wireHermes`, `wireHosts`, `mergeHooksJson`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-o9k-init-multi-cli.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
