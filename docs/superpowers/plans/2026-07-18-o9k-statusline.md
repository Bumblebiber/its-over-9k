# o9k Statusline Implementation Plan

> **SUPERSEDED (2026-07-24).** o9k no longer wires the statusline into host
> configs; the wiring described below was removed together with
> `statusline/wire-*.mjs`. The renderer survives and is documented in
> `docs/STATUSLINE.md`, which also explains why the wiring went. Kept as the
> design record — do not implement from this document.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in o9k statusline with selectable elements (tim/device/limits/context/model/git), host translation for Claude/Cursor/Hermes (Codex/OpenCode unsupported when no API), never auto-wired outside `/o9k-init`.

**Architecture:** Config + renderer under `plugins/o9k-core/scripts/statusline/`; canonical payload via `normalize.mjs`; per-host `wire-*.mjs` adapters; Init skill interview only (default skip). No new pillar.

**Tech Stack:** Node ≥18 ESM (`.mjs`), `node --test`, zero runtime deps. Env overrides: `O9K_STATUSLINE`, `O9K_STATUSLINE_MARQUEE`, `O9K_USAGE` (tests).

**Spec:** `docs/superpowers/specs/2026-07-18-o9k-statusline-design.md` (approved).

## File map

| Path | Responsibility |
|------|----------------|
| `plugins/o9k-core/scripts/statusline/config.mjs` | Read/write `~/.o9k/statusline.json` |
| `plugins/o9k-core/scripts/statusline/normalize.mjs` | Host stdin JSON → canonical |
| `plugins/o9k-core/scripts/statusline/segments/*.mjs` | One element each |
| `plugins/o9k-core/scripts/statusline/marquee.mjs` | Per-key scroll offsets |
| `plugins/o9k-core/scripts/statusline/render.mjs` | Join + priority trim + marquee |
| `plugins/o9k-core/scripts/statusline/o9k-statusline.mjs` | CLI entry (stdin → stdout) |
| `plugins/o9k-core/scripts/statusline/wire-claude.mjs` | `~/.claude/settings.json` |
| `plugins/o9k-core/scripts/statusline/wire-cursor.mjs` | `~/.cursor/cli-config.json` |
| `plugins/o9k-core/scripts/statusline/wire-hermes.mjs` | agent-hooks script + cli.py patch |
| `plugins/o9k-core/scripts/statusline/wire-codex.mjs` | `{ unsupported: true }` in v1 |
| `plugins/o9k-core/scripts/statusline/wire-opencode.mjs` | `{ unsupported: true }` in v1 |
| `plugins/o9k-core/scripts/statusline/wire-all.mjs` | Orchestrate wires from Init |
| `plugins/o9k-core/skills/o9k-init/SKILL.md` | Interview steps |
| `plugins/o9k-core/scripts/o9k-doctor.mjs` | Statusline checks |
| `plugins/o9k-core/scripts/o9k-uninstall.mjs` | Strip o9k-owned statusLine |
| `CHANGELOG.md` | Release note |

## Global constraints

- Never call statusline wire from `refresh-hosts.mjs`, SessionStart hooks, or marketplace enable.
- Renderer: missing/disabled config → print empty string, exit 0.
- Wire replace uses `writeFileWithBackup` from `hosts/common.mjs`.
- Tests never touch real `~/.o9k/`; always temp dirs + env overrides.
- Command ownership marker: wired command must contain substring `o9k-statusline`.

---

### Task 1: Config module

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/config.mjs`
- Create: `plugins/o9k-core/scripts/statusline/config.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// config.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig, loadConfig, saveConfig, configPath } from "./config.mjs";

test("loadConfig returns null when missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  assert.equal(loadConfig({ path: path.join(dir, "missing.json") }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("saveConfig + loadConfig round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const p = path.join(dir, "statusline.json");
  const cfg = defaultConfig({ elements: ["tim", "model"] });
  saveConfig(cfg, { path: p });
  const got = loadConfig({ path: p });
  assert.equal(got.enabled, true);
  assert.deepEqual(got.elements, ["tim", "model"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("configPath respects O9K_STATUSLINE", () => {
  const prev = process.env.O9K_STATUSLINE;
  process.env.O9K_STATUSLINE = "/tmp/x-statusline.json";
  assert.equal(configPath(), "/tmp/x-statusline.json");
  if (prev === undefined) delete process.env.O9K_STATUSLINE;
  else process.env.O9K_STATUSLINE = prev;
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test plugins/o9k-core/scripts/statusline/config.test.mjs
```

Expected: cannot find module / missing exports.

- [ ] **Step 3: Implement config.mjs**

```js
// config.mjs — ~/.o9k/statusline.json read/write (O9K_STATUSLINE override).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ELEMENT_KEYS = ["tim", "device", "limits", "context", "model", "git"];

export function configPath() {
  return process.env.O9K_STATUSLINE || path.join(os.homedir(), ".o9k/statusline.json");
}

export function defaultConfig(overrides = {}) {
  return {
    version: 1,
    enabled: true,
    elements: ["tim", "device", "limits", "context", "model", "git"],
    priority: ["limits", "tim", "context", "model", "device", "git"],
    marquee: { enabled: true, keys: ["git", "tim"] },
    hosts: { claude: true, cursor: true, hermes: true },
    ...overrides,
  };
}

export function loadConfig(opts = {}) {
  const p = opts.path || configPath();
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    return null;
  }
}

export function saveConfig(cfg, opts = {}) {
  const p = opts.path || configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test plugins/o9k-core/scripts/statusline/config.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-core/scripts/statusline/config.mjs plugins/o9k-core/scripts/statusline/config.test.mjs
git commit -m "feat(statusline): config module for ~/.o9k/statusline.json"
```

---

### Task 2: Normalize host payloads

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/normalize.mjs`
- Create: `plugins/o9k-core/scripts/statusline/normalize.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePayload } from "./normalize.mjs";

test("empty / invalid → canonical defaults", () => {
  const c = normalizePayload(null, { host: "unknown" });
  assert.equal(c.host, "unknown");
  assert.equal(c.width, 80);
  assert.equal(c.model, null);
  assert.equal(c.context, null);
});

test("claude-shaped payload", () => {
  const c = normalizePayload(
    {
      cwd: "/proj",
      render_width_chars: 100,
      model: { id: "x", display_name: "Opus" },
      context_window: { used_percentage: 40, remaining_percentage: 60 },
      worktree: { name: "feat", path: "/wt" },
    },
    { host: "claude" },
  );
  assert.equal(c.width, 100);
  assert.equal(c.model.display_name, "Opus");
  assert.equal(c.context.used_percentage, 40);
  assert.equal(c.worktree.name, "feat");
  assert.equal(c.cwd, "/proj");
});

test("cursor payload uses same fields when present", () => {
  const c = normalizePayload(
    {
      cwd: "/c",
      render_width_chars: 90,
      model: { display_name: "Grok" },
    },
    { host: "cursor" },
  );
  assert.equal(c.host, "cursor");
  assert.equal(c.width, 90);
  assert.equal(c.model.display_name, "Grok");
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test plugins/o9k-core/scripts/statusline/normalize.test.mjs
```

- [ ] **Step 3: Implement normalize.mjs**

```js
// normalize.mjs — host statusline JSON → canonical payload.
export function normalizePayload(raw, opts = {}) {
  const host = opts.host || "unknown";
  const o = raw && typeof raw === "object" ? raw : {};
  const width =
    Number(o.render_width_chars) > 0 ? Math.floor(Number(o.render_width_chars)) : 80;
  const model =
    o.model && typeof o.model === "object"
      ? {
          id: o.model.id ?? null,
          display_name: o.model.display_name ?? o.model.displayName ?? null,
        }
      : null;
  const cw = o.context_window && typeof o.context_window === "object" ? o.context_window : null;
  const context = cw
    ? {
        used_percentage: cw.used_percentage ?? null,
        remaining_percentage: cw.remaining_percentage ?? null,
      }
    : null;
  const wt = o.worktree && typeof o.worktree === "object" ? o.worktree : null;
  const worktree = wt ? { name: wt.name ?? null, path: wt.path ?? null } : null;
  const cwd = o.cwd || o.workspace?.current_dir || null;
  return { host, cwd, width, model, context, worktree };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
node --test plugins/o9k-core/scripts/statusline/normalize.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-core/scripts/statusline/normalize.mjs plugins/o9k-core/scripts/statusline/normalize.test.mjs
git commit -m "feat(statusline): normalize host payloads to canonical shape"
```

---

### Task 3: Segments (placeholders + sources)

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/segments/model.mjs`
- Create: `plugins/o9k-core/scripts/statusline/segments/context.mjs`
- Create: `plugins/o9k-core/scripts/statusline/segments/git.mjs`
- Create: `plugins/o9k-core/scripts/statusline/segments/limits.mjs`
- Create: `plugins/o9k-core/scripts/statusline/segments/tim.mjs`
- Create: `plugins/o9k-core/scripts/statusline/segments/device.mjs`
- Create: `plugins/o9k-core/scripts/statusline/segments/index.mjs`
- Create: `plugins/o9k-core/scripts/statusline/segments.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "./segments/index.mjs";

test("model placeholder when missing", () => {
  assert.equal(renderSegment("model", { model: null }), "mdl:—");
});

test("model shows display_name", () => {
  assert.equal(renderSegment("model", { model: { display_name: "Opus" } }), "Opus");
});

test("context placeholder", () => {
  assert.equal(renderSegment("context", { context: null }), "ctx:—");
});

test("context percent", () => {
  assert.equal(
    renderSegment("context", { context: { used_percentage: 34.5 } }),
    "ctx:35%",
  );
});

test("limits placeholder when no usage file", () => {
  assert.equal(
    renderSegment("limits", { host: "claude" }, { usagePath: "/no/such/usage.json" }),
    "lim:—",
  );
});

test("tim placeholder when runner returns null", () => {
  assert.equal(
    renderSegment("tim", { cwd: "/x" }, { runTim: () => null }),
    "tim:—",
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test plugins/o9k-core/scripts/statusline/segments.test.mjs
```

- [ ] **Step 3: Implement segments**

`segments/model.mjs`:

```js
export function renderModel(canonical) {
  const name = canonical?.model?.display_name;
  return name ? String(name) : "mdl:—";
}
```

`segments/context.mjs`:

```js
export function renderContext(canonical) {
  const u = canonical?.context?.used_percentage;
  if (typeof u !== "number" || Number.isNaN(u)) return "ctx:—";
  return `ctx:${Math.round(u)}%`;
}
```

`segments/git.mjs`:

```js
import { execFileSync } from "node:child_process";

export function renderGit(canonical, opts = {}) {
  const wt = canonical?.worktree?.name;
  let branch = null;
  const cwd = canonical?.cwd || process.cwd();
  try {
    branch = execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    branch = null;
  }
  if (!branch && !wt) return "git:—";
  if (wt && branch) return `${branch}@${wt}`;
  return wt || branch;
}
```

`segments/limits.mjs`:

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function usagePath(opts) {
  return opts.usagePath || process.env.O9K_USAGE || path.join(os.homedir(), ".o9k/usage.json");
}

export function renderLimits(canonical, opts = {}) {
  let usage;
  try {
    usage = JSON.parse(fs.readFileSync(usagePath(opts), "utf8"));
  } catch {
    return "lim:—";
  }
  const host =
    canonical?.host === "cursor" ? "cursor" : canonical?.host === "codex" ? "codex" : "claude";
  const w5 = usage?.windows?.[`${host}:5h`];
  const ww = usage?.windows?.[`${host}:week`] || usage?.windows?.[`${host}:7d`];
  const parts = [];
  if (w5 && typeof w5.used === "number") parts.push(`5h:${Math.round(w5.used * 100)}%`);
  if (ww && typeof ww.used === "number") parts.push(`wk:${Math.round(ww.used * 100)}%`);
  return parts.length ? `lim:${parts.join(" ")}` : "lim:—";
}
```

`segments/tim.mjs`:

```js
import { execFileSync } from "node:child_process";

export function renderTim(canonical, opts = {}) {
  if (typeof opts.runTim === "function") {
    const v = opts.runTim(canonical);
    return v || "tim:—";
  }
  try {
    const out = execFileSync("tim", ["statusline", "--cwd", canonical?.cwd || process.cwd()], {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 800,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || "tim:—";
  } catch {
    return "tim:—";
  }
}
```

`segments/device.mjs`:

```js
import { execFileSync } from "node:child_process";

export function renderDevice(_canonical, opts = {}) {
  if (typeof opts.runDevice === "function") {
    const v = opts.runDevice();
    return v || "dev:—";
  }
  try {
    const out = execFileSync("tim", ["statusline", "--format", "hermes"], {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 800,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const j = JSON.parse(out);
    return j.device ? String(j.device) : "dev:—";
  } catch {
    return "dev:—";
  }
}
```

`segments/index.mjs`:

```js
import { renderModel } from "./model.mjs";
import { renderContext } from "./context.mjs";
import { renderGit } from "./git.mjs";
import { renderLimits } from "./limits.mjs";
import { renderTim } from "./tim.mjs";
import { renderDevice } from "./device.mjs";

const RENDERERS = {
  model: renderModel,
  context: renderContext,
  git: renderGit,
  limits: renderLimits,
  tim: renderTim,
  device: renderDevice,
};

export function renderSegment(key, canonical, opts = {}) {
  const fn = RENDERERS[key];
  if (!fn) return "";
  return fn(canonical, opts);
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
node --test plugins/o9k-core/scripts/statusline/segments.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-core/scripts/statusline/segments plugins/o9k-core/scripts/statusline/segments.test.mjs
git commit -m "feat(statusline): element segments with placeholders"
```

---

### Task 4: Render + marquee

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/marquee.mjs`
- Create: `plugins/o9k-core/scripts/statusline/render.mjs`
- Create: `plugins/o9k-core/scripts/statusline/render.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderLine } from "./render.mjs";

test("joins segments with middle dot", () => {
  const line = renderLine({
    config: {
      enabled: true,
      elements: ["model", "context"],
      priority: ["model", "context"],
      marquee: { enabled: false, keys: [] },
    },
    segments: { model: "Opus", context: "ctx:40%" },
    width: 80,
  });
  assert.equal(line, "Opus · ctx:40%");
});

test("drops lowest keep-priority when over width", () => {
  const line = renderLine({
    config: {
      enabled: true,
      elements: ["model", "git"],
      priority: ["model", "git"],
      marquee: { enabled: false, keys: [] },
    },
    segments: { model: "Opus", git: "x".repeat(100) },
    width: 20,
  });
  assert.ok(line.length <= 20);
  assert.ok(line.includes("Opus"));
});

test("marquee advances offset for long key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-mq-"));
  const statePath = path.join(dir, "mq.json");
  const cfg = {
    enabled: true,
    elements: ["git"],
    priority: ["git"],
    marquee: { enabled: true, keys: ["git"] },
  };
  const a = renderLine({
    config: cfg,
    segments: { git: "abcdefghij" },
    width: 5,
    marqueePath: statePath,
  });
  const b = renderLine({
    config: cfg,
    segments: { git: "abcdefghij" },
    width: 5,
    marqueePath: statePath,
  });
  assert.notEqual(a, b);
  assert.equal(a.length, 5);
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test plugins/o9k-core/scripts/statusline/render.test.mjs
```

- [ ] **Step 3: Implement marquee.mjs + render.mjs**

`marquee.mjs`:

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function marqueePath(opts = {}) {
  return (
    opts.marqueePath ||
    process.env.O9K_STATUSLINE_MARQUEE ||
    path.join(os.homedir(), ".o9k/statusline-marquee.json")
  );
}

export function loadOffsets(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

export function saveOffsets(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify(obj)}\n`);
  } catch {
    // ignore
  }
}

export function applyMarquee(key, text, slot, statePath) {
  if (slot <= 0) return "";
  if (text.length <= slot) return text;
  const loop = `${text} · `;
  const offsets = loadOffsets(statePath);
  const off = (Number(offsets[key]) || 0) % loop.length;
  offsets[key] = off + 1;
  saveOffsets(statePath, offsets);
  let out = "";
  for (let i = 0; i < slot; i++) out += loop[(off + i) % loop.length];
  return out;
}
```

`render.mjs`:

```js
import { applyMarquee, marqueePath } from "./marquee.mjs";

const SEP = " · ";

function ellipsize(s, max) {
  if (s.length <= max) return s;
  if (max <= 1) return "…".slice(0, max);
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

export function renderLine({ config, segments, width, marqueePath: mqPath }) {
  if (!config?.enabled) return "";
  const keys = (config.elements || []).filter((k) => segments[k] != null && segments[k] !== "");
  const priority = config.priority || keys;
  const parts = Object.fromEntries(keys.map((k) => [k, String(segments[k])]));
  const statePath = mqPath || marqueePath();
  const join = (order) => order.map((k) => parts[k]).filter(Boolean).join(SEP);

  let order = keys.slice();
  const budget = Math.max(1, width || 80);
  const shrinkOrder = [...priority].reverse().filter((k) => order.includes(k));

  let guard = 0;
  while (join(order).length > budget && shrinkOrder.length && guard++ < 200) {
    const victim = shrinkOrder[0];
    const minW = 4;
    if ((parts[victim] || "").length > minW) {
      parts[victim] = ellipsize(parts[victim], Math.max(minW, parts[victim].length - 4));
    } else {
      shrinkOrder.shift();
      order = order.filter((k) => k !== victim);
      delete parts[victim];
    }
  }

  if (config.marquee?.enabled) {
    const mqKeys = new Set(config.marquee.keys || []);
    for (const k of order) {
      if (!mqKeys.has(k)) continue;
      const others = join(order.filter((x) => x !== k));
      const slot = Math.max(4, budget - (others ? others.length + SEP.length : 0));
      if (parts[k].length > slot) {
        parts[k] = applyMarquee(k, parts[k], slot, statePath);
      }
    }
  }

  let line = join(order);
  if (line.length > budget) line = ellipsize(line, budget);
  return line;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
node --test plugins/o9k-core/scripts/statusline/render.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-core/scripts/statusline/marquee.mjs plugins/o9k-core/scripts/statusline/render.mjs plugins/o9k-core/scripts/statusline/render.test.mjs
git commit -m "feat(statusline): priority trim and optional marquee"
```

---

### Task 5: CLI entry `o9k-statusline.mjs`

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/o9k-statusline.mjs`
- Create: `plugins/o9k-core/scripts/statusline/o9k-statusline.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("./o9k-statusline.mjs", import.meta.url));

test("prints empty when config missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const r = spawnSync(process.execPath, [entry, "--host", "claude"], {
    input: "{}",
    encoding: "utf8",
    env: { ...process.env, O9K_STATUSLINE: path.join(dir, "nope.json") },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("renders model from stdin when enabled", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-sl-"));
  const cfg = path.join(dir, "statusline.json");
  fs.writeFileSync(
    cfg,
    JSON.stringify({
      version: 1,
      enabled: true,
      elements: ["model"],
      priority: ["model"],
      marquee: { enabled: false, keys: [] },
      hosts: {},
    }),
  );
  const r = spawnSync(process.execPath, [entry, "--host", "claude"], {
    input: JSON.stringify({
      model: { display_name: "Opus" },
      render_width_chars: 80,
    }),
    encoding: "utf8",
    env: { ...process.env, O9K_STATUSLINE: cfg },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "Opus");
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test plugins/o9k-core/scripts/statusline/o9k-statusline.test.mjs
```

- [ ] **Step 3: Implement entry**

```js
#!/usr/bin/env node
// o9k-statusline.mjs — host statusline command: stdin JSON → one line.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";
import { normalizePayload } from "./normalize.mjs";
import { renderSegment } from "./segments/index.mjs";
import { renderLine } from "./render.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  let host = "unknown";
  let format = "text";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--host" && argv[i + 1]) host = argv[++i];
    else if (argv[i] === "--format" && argv[i + 1]) format = argv[++i];
  }
  return { host, format };
}

export function runStatusline({ stdin, host, format }) {
  const cfg = loadConfig();
  if (!cfg?.enabled) {
    return format === "hermes" ? "{}\n" : "";
  }
  let raw = null;
  try {
    raw = stdin.trim() ? JSON.parse(stdin) : null;
  } catch {
    raw = null;
  }
  const canonical = normalizePayload(raw, { host });
  const segments = {};
  for (const key of cfg.elements || []) {
    segments[key] = renderSegment(key, canonical);
  }
  const line = renderLine({ config: cfg, segments, width: canonical.width });
  if (format === "hermes") return `${JSON.stringify({ line })}\n`;
  return line ? `${line}\n` : "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { host, format } = parseArgs(process.argv);
  process.stdout.write(runStatusline({ stdin: readStdin(), host, format }));
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
node --test plugins/o9k-core/scripts/statusline/o9k-statusline.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-core/scripts/statusline/o9k-statusline.mjs plugins/o9k-core/scripts/statusline/o9k-statusline.test.mjs
git commit -m "feat(statusline): CLI entry for host statusLine commands"
```

---

### Task 6: Wire Claude + Cursor

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/command-path.mjs`
- Create: `plugins/o9k-core/scripts/statusline/wire-claude.mjs`
- Create: `plugins/o9k-core/scripts/statusline/wire-cursor.mjs`
- Create: `plugins/o9k-core/scripts/statusline/wire-claude-cursor.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wireClaudeStatusline } from "./wire-claude.mjs";
import { wireCursorStatusline } from "./wire-cursor.mjs";

const marketplaceRoot = path.join(fileURLToPath(new URL("../../..", import.meta.url)));

test("wireClaude replace writes statusLine and backup", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wcl-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const settings = path.join(home, ".claude/settings.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({ statusLine: { type: "command", command: "echo old" } }),
  );
  const r = wireClaudeStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(`${settings}.o9k-bak`));
  const j = JSON.parse(fs.readFileSync(settings, "utf8"));
  assert.match(j.statusLine.command, /o9k-statusline/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireClaude keep leaves foreign command", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wcl-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const settings = path.join(home, ".claude/settings.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({ statusLine: { type: "command", command: "echo old" } }),
  );
  const r = wireClaudeStatusline({ home, marketplaceRoot, mode: "keep" });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
  const j = JSON.parse(fs.readFileSync(settings, "utf8"));
  assert.equal(j.statusLine.command, "echo old");
  fs.rmSync(home, { recursive: true, force: true });
});

test("wireCursor replace sets cli-config statusLine", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wcu-"));
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  const r = wireCursorStatusline({ home, marketplaceRoot, mode: "replace" });
  assert.equal(r.ok, true);
  const j = JSON.parse(fs.readFileSync(path.join(home, ".cursor/cli-config.json"), "utf8"));
  assert.match(j.statusLine.command, /o9k-statusline/);
  fs.rmSync(home, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test plugins/o9k-core/scripts/statusline/wire-claude-cursor.test.mjs
```

- [ ] **Step 3: Implement**

`command-path.mjs`:

```js
import path from "node:path";
import process from "node:process";

export function o9kStatuslineCommand(marketplaceRoot, host) {
  const script = path.join(marketplaceRoot, "o9k-core/scripts/statusline/o9k-statusline.mjs");
  return `${process.execPath} ${script} --host ${host}`;
}

export function isO9kStatuslineCommand(cmd) {
  return typeof cmd === "string" && cmd.includes("o9k-statusline");
}
```

`wire-claude.mjs`:

```js
import path from "node:path";
import { readJsonSafe, writeFileWithBackup } from "../hosts/common.mjs";
import { isO9kStatuslineCommand, o9kStatuslineCommand } from "./command-path.mjs";

export function wireClaudeStatusline({ home, marketplaceRoot, mode = "replace", dryRun = false }) {
  const settingsPath = path.join(home, ".claude/settings.json");
  const existing = readJsonSafe(settingsPath) ?? {};
  const prev = existing.statusLine?.command;
  if (mode === "keep" && prev && !isO9kStatuslineCommand(prev)) {
    return { ok: true, skipped: true, detail: "kept existing statusLine" };
  }
  const next = {
    ...existing,
    statusLine: {
      type: "command",
      command: o9kStatuslineCommand(marketplaceRoot, "claude"),
    },
  };
  if (!dryRun) writeFileWithBackup(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  return { ok: true, detail: `wired ${settingsPath}` };
}
```

`wire-cursor.mjs`: same pattern for `path.join(home, ".cursor/cli-config.json")`, host `"cursor"`. Merge into existing cli-config object; do not wipe unrelated keys.

- [ ] **Step 4: Run — expect PASS + commit**

```bash
git add plugins/o9k-core/scripts/statusline/command-path.mjs \
  plugins/o9k-core/scripts/statusline/wire-claude.mjs \
  plugins/o9k-core/scripts/statusline/wire-cursor.mjs \
  plugins/o9k-core/scripts/statusline/wire-claude-cursor.test.mjs
git commit -m "feat(statusline): wire Claude and Cursor statusLine commands"
```

---

### Task 7: Wire Hermes (script + cli.py patch)

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/hermes-o9k-statusline.sh`
- Create: `plugins/o9k-core/scripts/statusline/wire-hermes.mjs`
- Create: `plugins/o9k-core/scripts/statusline/wire-hermes.test.mjs`

Hermes has no settings `statusLine`. Install `~/.hermes/agent-hooks/hermes-o9k-statusline.sh` and idempotently patch `~/.hermes/hermes-agent/cli.py` to call it and prefix the TUI bar with JSON field `line`.

- [ ] **Step 1: Write failing tests** with a fixture `cli.py` that contains a stable insert anchor (e.g. a stub `def _render_status_bar` or the same region TIM patches). After wire: script exists; `cli.py` contains `_get_o9k_status` and `o9k-statusline`. Second wire is idempotent. Missing `cli.py` → `{ ok: false, unsupported: true }`.

- [ ] **Step 2: Implement**

`hermes-o9k-statusline.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="${O9K_MARKETPLACE_ROOT:-}"
if [[ -z "$ROOT" ]]; then
  ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
fi
exec node "$ROOT/o9k-core/scripts/statusline/o9k-statusline.mjs" --host hermes --format hermes
```

Note: when installed under `~/.hermes/agent-hooks/`, set `O9K_MARKETPLACE_ROOT` in the script body at install time (rewrite absolute marketplace path into the installed copy) so ROOT does not depend on symlink layout.

`wire-hermes.mjs`:

- Python method `_get_o9k_status` runs `bash ~/.hermes/agent-hooks/hermes-o9k-statusline.sh`, parses JSON, returns dict.
- Prefix block: `o9k_prefix = (self._get_o9k_status() or {}).get("line") or ""`.
- `patchCliPy(src)` returns `{ text, already, unsupported }` — if already patched, return unchanged; if no anchor, `unsupported: true`.
- `wireHermesStatusline({ home, marketplaceRoot, mode, dryRun })`:
  - `mode === "keep"` and existing TIM/hmem/foreign patch without o9k → skip.
  - else install script + patch. Backup `cli.py` to `cli.py.o9k-bak` before first change via `writeFileWithBackup` or copyFile.

- [ ] **Step 3: PASS + commit**

```bash
git commit -m "feat(statusline): Hermes agent-hooks script and cli.py patch"
```

---

### Task 8: Codex/OpenCode unsupported + wire-all

**Files:**
- Create: `plugins/o9k-core/scripts/statusline/wire-codex.mjs`
- Create: `plugins/o9k-core/scripts/statusline/wire-opencode.mjs`
- Create: `plugins/o9k-core/scripts/statusline/wire-all.mjs`
- Create: `plugins/o9k-core/scripts/statusline/wire-all.test.mjs`

- [ ] **Step 1: Tests**

```js
test("wireCodexStatusline is unsupported", () => {
  const r = wireCodexStatusline({ home: "/tmp", marketplaceRoot: "/tmp" });
  assert.equal(r.ok, false);
  assert.equal(r.unsupported, true);
});
```

Plus `wireAll` with temp home: cursor replace ok; codex entry in results has `unsupported: true`.

- [ ] **Step 2: Implement**

```js
// wire-codex.mjs
export function wireCodexStatusline() {
  return { ok: false, unsupported: true, detail: "codex has no statusLine API in v1" };
}
```

```js
// wire-opencode.mjs
export function wireOpencodeStatusline() {
  return { ok: false, unsupported: true, detail: "opencode has no statusLine API in v1" };
}
```

`wire-all.mjs` maps hosts → runners; CLI:

```bash
node plugins/o9k-core/scripts/statusline/wire-all.mjs \
  --marketplace <plugins-dir> \
  --hosts claude:replace,cursor:replace,hermes:replace,codex:replace
```

Print JSON results on stdout. `--home` defaults to `os.homedir()`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(statusline): wire-all orchestrator; codex/opencode unsupported"
```

---

### Task 9: Init skill interview (opt-in)

**Files:**
- Modify: `plugins/o9k-core/skills/o9k-init/SKILL.md`

- [ ] **Step 1: Add interview item in Step 2** (after hosts/bundle; renumber as needed):

```markdown
N. **Statusline (opt-in, default Skip)** — never install without an explicit Yes.
   - Ask: "Set up the o9k statusline?" Options: **Skip (default)** / Yes.
   - If Skip: do not write `~/.o9k/statusline.json`, do not call `wire-all`.
   - If Yes:
     1. Multi-select elements: `tim`, `device`, `limits`, `context`, `model`, `git` (at least one).
     2. Write config with `saveConfig(defaultConfig({ elements }))` via a short node invocation.
     3. For each **present** host from Step 1:
        - Claude / Cursor / Hermes: if existing non-o9k statusline → ask **keep** / **replace**.
        - Codex / OpenCode: report `statusline: unsupported` (do not pretend to wire).
     4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/statusline/wire-all.mjs" --marketplace … --hosts …`.
   - **Hard rule:** `--refresh-hosts` / SessionStart / plugin enable must never wire statusline.
```

- [ ] **Step 2: Verify no auto-wire**

```bash
rg -n 'statusline|statusLine' plugins/o9k-core/scripts/refresh-hosts.mjs plugins/o9k-core/scripts/session-start.mjs
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(o9k-init): opt-in statusline interview; never auto-wire"
```

---

### Task 10: Doctor + uninstall

**Files:**
- Modify: `plugins/o9k-core/scripts/o9k-doctor.mjs`
- Modify: `plugins/o9k-core/scripts/o9k-uninstall.mjs`
- Modify: `plugins/o9k-core/scripts/o9k-doctor-uninstall.test.mjs`

- [ ] **Step 1: Extend tests** — enabled config + o9k cursor command → clean; foreign command → problem; uninstall removes only o9k-owned `statusLine`; leaves foreign; mentions `.o9k-bak` when present.

- [ ] **Step 2: Implement** using `isO9kStatuslineCommand`. Hermes: flag `_get_o9k_status` in cli.py; uninstall removes o9k method/prefix best-effort and deletes `hermes-o9k-statusline.sh` when o9k-owned. Do not auto-restore bak files.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(statusline): doctor + uninstall for o9k-owned statusLine"
```

---

### Task 11: CHANGELOG + spec status

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-07-18-o9k-statusline-design.md` (Status → Approved)

- [ ] **Step 1: Changelog under Unreleased / next**

```markdown
### Added
- Opt-in o9k statusline (`scripts/statusline/`): selectable elements, host
  translation for Claude/Cursor/Hermes; Codex/OpenCode reported unsupported.
  Wired only from `/o9k-init` (default skip) — never from refresh-hosts.
```

- [ ] **Step 2: Full test suite**

```bash
find plugins -type f -name '*.test.mjs' | sort | xargs node --test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: changelog + approve statusline design spec"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Opt-in Init only, default skip | 9 |
| Selectable elements A–F | 3, 9 |
| Placeholders when empty | 3 |
| Priority trim + marquee | 4 |
| Canonical normalize / translation | 2, 5 |
| Claude + Cursor wire + keep/replace | 6 |
| Hermes wire | 7 |
| Codex/OpenCode unsupported | 8 |
| No refresh-hosts auto-wire | 9 |
| Doctor / uninstall | 10 |
| Hermetic tests | 1–8, 10 |

## Self-review notes

- Codex/OpenCode: explicit unsupported returns (no TBD in steps).
- Hermes open point closed as: programmatic `cli.py` patch with `{ line }`; missing anchor → unsupported.
- `priority[0]` = highest keep priority (matches spec).
- Ownership marker: substring `o9k-statusline` consistent across wire/doctor/uninstall.
