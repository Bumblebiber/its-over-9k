# Cross-CLI Runs — Watcher Mailbox & Agentless Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship disk-first run registry + mailbox helpers, a blocking mailbox wait for disposable internal watchers, and agentless `o9k-resume` so external tmux workers survive host crashes.

**Architecture:** New zero-dep Node module `plugins/o9k-roster/scripts/runs.mjs` (create/classify/answer/resume) plus `wait-mailbox.sh` (one blocking OS wait). Lives in the existing `o9k-roster` pillar next to `roster.mjs` — no new pillar for v1. User state under `~/.o9k/runs/` (override `O9K_RUNS` in tests). Watcher is a *skill contract* (return on question → parent respawns); code owns disk + wait + boot resume only.

**Tech Stack:** Node ≥18 ESM, `node --test`, bash (`inotifywait` + sleep fallback), systemd user unit. Zero new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-cross-cli-run-resume-design.md` (rev 2).

## Decisions locked in this plan

| Open point | Decision |
|---|---|
| Package home | `plugins/o9k-roster/scripts/` (`runs.mjs`, `wait-mailbox.sh`) |
| Claude resume argv | `claude --resume <sessionId>` then inject as separate paste/prompt after session up — see Task 5 (positional prompt after `--resume` is unreliable across versions; prefer paste-buffer inject) |
| Codex resume argv | `codex resume <sessionId>` when id known; else cold start from `PROMPT.md` |
| Cursor | cold start + PROMPT inject for v1 unless `cursor-agent` documents stable resume id |
| Wait ceiling | default **3600s**; soft return `watching` so parent respawns watcher |
| systemd | ship unit file; `/o9k-init` opt-in enable (server installs can default on later) |
| TIM | no run-event bus; skills say closeout-only |

## File map

| File | Responsibility |
|---|---|
| `plugins/o9k-roster/scripts/runs.mjs` | Run CRUD, atomic STATE, classify mailbox, resume adapters, CLI |
| `plugins/o9k-roster/scripts/runs.test.mjs` | Hermetic tests (`O9K_RUNS` temp dir) |
| `plugins/o9k-roster/scripts/wait-mailbox.sh` | Blocking inotifywait / sleep-loop; exit codes encode wake reason |
| `plugins/o9k-roster/scripts/wait-mailbox.test.sh` | Smoke tests for wait script |
| `plugins/o9k-roster/systemd/o9k-resume.service` | Oneshoot user unit after default.target |
| `plugins/o9k-roster/skills/roster/SKILL.md` | Parent/watcher contract + `runs` CLI usage |
| `plugins/o9k-roster/templates/worker-prompt.md` | PROMPT scaffold: HEARTBEAT + QUESTIONS/RESULT protocol |
| `docs/MULTI-AGENT.md` | Point at runs/mailbox/resume |
| `CHANGELOG.md` | User-facing note |

---

### Task 1: `runs.mjs` — paths, atomic STATE, createRun

**Files:**
- Create: `plugins/o9k-roster/scripts/runs.mjs`
- Create: `plugins/o9k-roster/scripts/runs.test.mjs`

- [ ] **Step 1: Write failing tests for paths + atomic write + create**

```js
// plugins/o9k-roster/scripts/runs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runsRoot, runDir, atomicWriteJson, createRun, loadState,
} from "./runs.mjs";

function withTempRuns(fn) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-runs-"));
    const prev = process.env.O9K_RUNS;
    process.env.O9K_RUNS = dir;
    try {
      await fn(dir);
    } finally {
      if (prev === undefined) delete process.env.O9K_RUNS;
      else process.env.O9K_RUNS = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test("runsRoot respects O9K_RUNS", withTempRuns(async (dir) => {
  assert.equal(runsRoot(), dir);
}));

test("atomicWriteJson never leaves partial JSON", withTempRuns(async (dir) => {
  const target = path.join(dir, "x.json");
  atomicWriteJson(target, { a: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), { a: 1 });
  atomicWriteJson(target, { a: 2, b: "ok" });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), { a: 2, b: "ok" });
}));

test("createRun writes STATE + mailbox skeleton", withTempRuns(async () => {
  const state = createRun({
    cwd: "/tmp/proj",
    project: "P0054",
    role: "implementer",
    parent: { cli: "claude", sessionId: "sess-1", attach: "manual" },
    worker: { cli: "codex", model: "gpt-test", tmux: "o9k-implementer-test" },
    prompt: "## Task\nDo the thing.\n",
  });
  assert.match(state.runId, /^\d{8}T\d{6}Z-[a-z0-9]+$/);
  assert.equal(state.status, "starting");
  assert.equal(state.parent.tmux, null);
  assert.equal(state.parent.attach, "manual");
  const rd = runDir(state.runId);
  assert.ok(fs.existsSync(path.join(rd, "STATE.json")));
  assert.ok(fs.existsSync(path.join(rd, "mailbox", "STATUS")));
  assert.equal(fs.readFileSync(path.join(rd, "mailbox", "STATUS"), "utf8").trim(), "starting");
  assert.match(fs.readFileSync(path.join(rd, "mailbox", "PROMPT.md"), "utf8"), /Do the thing/);
  assert.deepEqual(loadState(state.runId).runId, state.runId);
}));
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd /home/bbbee/projects/o9k/plugins/o9k-roster/scripts
node --test runs.test.mjs
```

Expected: `Cannot find module` / fail to import.

- [ ] **Step 3: Implement minimal `runs.mjs`**

```js
#!/usr/bin/env node
// runs.mjs — disk-first cross-CLI run registry + mailbox + agentless resume.
// State: ~/.o9k/runs/<runId>/ (O9K_RUNS override). Zero dependencies.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export function runsRoot() {
  return process.env.O9K_RUNS || path.join(os.homedir(), ".o9k/runs");
}

export function runDir(runId) {
  return path.join(runsRoot(), runId);
}

export function atomicWriteJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

export function atomicWriteText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text.endsWith("\n") ? text : `${text}\n`);
  fs.renameSync(tmp, filePath);
}

function newRunId(now = new Date()) {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  // 20260717T130000Z
  const short = Math.random().toString(36).slice(2, 6);
  return `${iso}-${short}`;
}

export function createRun({
  cwd, project, role, parent, worker, prompt, now = new Date(),
}) {
  const runId = newRunId(now);
  const attach = parent.attach || (parent.tmux ? "tmux" : "manual");
  const state = {
    runId,
    version: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    cwd,
    project: project || null,
    role,
    status: "starting",
    parent: {
      cli: parent.cli,
      sessionId: parent.sessionId || null,
      tmux: attach === "tmux" ? (parent.tmux || null) : null,
      attach,
    },
    worker: {
      cli: worker.cli,
      model: worker.model || null,
      sessionId: worker.sessionId || null,
      tmux: worker.tmux || null,
    },
    watcher: { kind: "internal_subagent", attached: false },
    mailbox: "mailbox/",
  };
  const rd = runDir(runId);
  const mb = path.join(rd, "mailbox");
  fs.mkdirSync(mb, { recursive: true });
  atomicWriteJson(path.join(rd, "STATE.json"), state);
  atomicWriteText(path.join(mb, "STATUS"), "starting");
  atomicWriteText(path.join(mb, "PROMPT.md"), prompt);
  return state;
}

export function loadState(runId) {
  const p = path.join(runDir(runId), "STATE.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export function saveState(state) {
  state.updatedAt = new Date().toISOString();
  atomicWriteJson(path.join(runDir(state.runId), "STATE.json"), state);
  return state;
}
```

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
node --test runs.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-roster/scripts/runs.mjs plugins/o9k-roster/scripts/runs.test.mjs
git commit -m "$(cat <<'EOF'
feat(roster): runs registry — createRun + atomic STATE.json

EOF
)"
```

---

### Task 2: Mailbox classify + answer + status transitions

**Files:**
- Modify: `plugins/o9k-roster/scripts/runs.mjs`
- Modify: `plugins/o9k-roster/scripts/runs.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { classifyMailbox, writeAnswer, setStatus } from "./runs.mjs";

test("classifyMailbox prefers question over watching", withTempRuns(async () => {
  const s = createRun({
    cwd: "/tmp/p", role: "implementer",
    parent: { cli: "claude", attach: "manual" },
    worker: { cli: "codex", tmux: "t1" },
    prompt: "x",
  });
  const mb = path.join(runDir(s.runId), "mailbox");
  atomicWriteText(path.join(mb, "STATUS"), "waiting_human");
  atomicWriteText(path.join(mb, "QUESTIONS.md"), "Which DB?\n");
  const c = classifyMailbox(s.runId);
  assert.equal(c.status, "question");
  assert.match(c.question, /Which DB/);
}));

test("classifyMailbox returns done when RESULT present", withTempRuns(async () => {
  const s = createRun({
    cwd: "/tmp/p", role: "implementer",
    parent: { cli: "claude", attach: "manual" },
    worker: { cli: "codex", tmux: "t1" },
    prompt: "x",
  });
  const mb = path.join(runDir(s.runId), "mailbox");
  atomicWriteText(path.join(mb, "STATUS"), "done");
  atomicWriteText(path.join(mb, "RESULT.md"), "# ok\n");
  assert.equal(classifyMailbox(s.runId).status, "done");
}));

test("writeAnswer sets waiting path for worker", withTempRuns(async () => {
  const s = createRun({
    cwd: "/tmp/p", role: "implementer",
    parent: { cli: "claude", attach: "manual" },
    worker: { cli: "codex", tmux: "t1" },
    prompt: "x",
  });
  writeAnswer(s.runId, "Use SQLite.", { source: "parent" });
  const ans = fs.readFileSync(path.join(runDir(s.runId), "mailbox", "ANSWER.md"), "utf8");
  assert.match(ans, /Use SQLite/);
  assert.equal(loadState(s.runId).status, "watching");
}));
```

- [ ] **Step 2: Run — expect FAIL (exports missing)**

```bash
node --test runs.test.mjs
```

- [ ] **Step 3: Implement classify / answer / setStatus**

```js
export function mailboxDir(runId) {
  return path.join(runDir(runId), "mailbox");
}

function readMaybe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

/** Inspect mailbox once; return { status, question?, resultPath?, error? }. */
export function classifyMailbox(runId) {
  const mb = mailboxDir(runId);
  const statusLine = (readMaybe(path.join(mb, "STATUS")) || "").trim();
  const questions = readMaybe(path.join(mb, "QUESTIONS.md"));
  const result = readMaybe(path.join(mb, "RESULT.md"));
  const resultPath = path.join(mb, "RESULT.md");

  if (statusLine === "failed") {
    return { status: "failed", error: "STATUS=failed", resultPath: result ? resultPath : null };
  }
  if (statusLine === "done" && result) {
    return { status: "done", resultPath, summary: result.slice(0, 500) };
  }
  if (questions && questions.trim() && statusLine !== "done") {
    // If ANSWER.md is newer than QUESTIONS.md, question already handled this round
    const qStat = fs.statSync(path.join(mb, "QUESTIONS.md"));
    const aPath = path.join(mb, "ANSWER.md");
    let answered = false;
    try {
      const aStat = fs.statSync(aPath);
      answered = aStat.mtimeMs >= qStat.mtimeMs;
    } catch { /* no answer yet */ }
    if (!answered) {
      return { status: "question", question: questions.trim().slice(0, 2000) };
    }
  }
  if (statusLine === "waiting_human" && questions?.trim()) {
    return { status: "question", question: questions.trim().slice(0, 2000) };
  }
  return { status: "watching" };
}

export function setStatus(runId, status) {
  const state = loadState(runId);
  if (!state) throw new Error(`unknown run ${runId}`);
  state.status = status;
  saveState(state);
  atomicWriteText(path.join(mailboxDir(runId), "STATUS"), status);
  return state;
}

export function writeAnswer(runId, body, { source = "parent" } = {}) {
  const header = `<!-- source: ${source} -->\n`;
  atomicWriteText(path.join(mailboxDir(runId), "ANSWER.md"), header + body.trim() + "\n");
  return setStatus(runId, "watching");
}
```

- [ ] **Step 4: Run tests — PASS**

```bash
node --test runs.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-roster/scripts/runs.mjs plugins/o9k-roster/scripts/runs.test.mjs
git commit -m "$(cat <<'EOF'
feat(roster): mailbox classify + writeAnswer

EOF
)"
```

---

### Task 3: `wait-mailbox.sh` — one blocking OS wait

**Files:**
- Create: `plugins/o9k-roster/scripts/wait-mailbox.sh`
- Create: `plugins/o9k-roster/scripts/wait-mailbox.test.sh`

- [ ] **Step 1: Write the wait script**

```bash
#!/usr/bin/env bash
# wait-mailbox.sh — block until mailbox changes or ceiling.
# Usage: wait-mailbox.sh <mailbox-dir> [--ceiling-sec N]
# Exit: 0 = filesystem event or file appeared; 2 = ceiling; 1 = usage error
set -euo pipefail
MB="${1:-}"
shift || true
CEILING=3600
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ceiling-sec) CEILING="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$MB" && -d "$MB" ]] || { echo "usage: wait-mailbox.sh <mailbox-dir> [--ceiling-sec N]" >&2; exit 1; }

if command -v inotifywait >/dev/null 2>&1; then
  # -t is seconds; exit 2 on timeout (inotify-tools)
  if inotifywait -e create,close_write,moved_to,modify -t "$CEILING" --format '%w%f' "$MB" >/tmp/o9k-wait-mailbox.$$.out 2>/dev/null; then
    rm -f /tmp/o9k-wait-mailbox.$$.out
    exit 0
  else
    ec=$?
    rm -f /tmp/o9k-wait-mailbox.$$.out
    # inotifywait returns 2 on timeout
    if [[ "$ec" -eq 2 ]]; then exit 2; fi
    exit "$ec"
  fi
fi

# Fallback: sleep loop in ONE process (still one tool invocation from the agent)
deadline=$((SECONDS + CEILING))
snapshot() { find "$MB" -type f -printf '%p %T@ %s\n' 2>/dev/null | sort; }
prev="$(snapshot || true)"
while (( SECONDS < deadline )); do
  sleep 5
  cur="$(snapshot || true)"
  if [[ "$cur" != "$prev" ]]; then
    exit 0
  fi
done
exit 2
```

- [ ] **Step 2: Make executable + smoke test script**

```bash
#!/usr/bin/env bash
# wait-mailbox.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/mailbox"
# background writer
( sleep 1; echo hi > "$TMP/mailbox/STATUS" ) &
set +e
"$ROOT/wait-mailbox.sh" "$TMP/mailbox" --ceiling-sec 10
ec=$?
set -e
[[ "$ec" -eq 0 ]] || { echo "expected exit 0 got $ec"; exit 1; }
# ceiling
set +e
"$ROOT/wait-mailbox.sh" "$TMP/mailbox" --ceiling-sec 2
ec=$?
set -e
[[ "$ec" -eq 2 ]] || { echo "expected exit 2 got $ec"; exit 1; }
echo "wait-mailbox.test.sh OK"
```

- [ ] **Step 3: Run smoke test**

```bash
chmod +x plugins/o9k-roster/scripts/wait-mailbox.sh plugins/o9k-roster/scripts/wait-mailbox.test.sh
bash plugins/o9k-roster/scripts/wait-mailbox.test.sh
```

Expected: `wait-mailbox.test.sh OK`

- [ ] **Step 4: Commit**

```bash
git add plugins/o9k-roster/scripts/wait-mailbox.sh plugins/o9k-roster/scripts/wait-mailbox.test.sh
git commit -m "$(cat <<'EOF'
feat(roster): wait-mailbox.sh — inotifywait with sleep fallback

EOF
)"
```

---

### Task 4: CLI surface — `node runs.mjs <cmd>`

**Files:**
- Modify: `plugins/o9k-roster/scripts/runs.mjs`
- Modify: `plugins/o9k-roster/scripts/runs.test.mjs`

- [ ] **Step 1: Add CLI tests via `execFileSync` against the script**

```js
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUNS_BIN = fileURLToPath(new URL("./runs.mjs", import.meta.url));

test("CLI create + classify + answer", withTempRuns(async (dir) => {
  const out = execFileSync("node", [
    RUNS_BIN, "create",
    "--cwd", "/tmp/p",
    "--role", "implementer",
    "--parent-cli", "claude",
    "--parent-attach", "manual",
    "--worker-cli", "codex",
    "--worker-tmux", "o9k-w-1",
    "--prompt-file", path.join(dir, "prompt.md"),
  ], {
    env: { ...process.env, O9K_RUNS: dir },
    encoding: "utf8",
    input: "",
  });
  // create writes prompt-file first
}));
```

Prefer simpler: write `prompt.md` in the temp dir before create, assert stdout contains `runId:`.

Full create test body:

```js
test("CLI create prints runId", withTempRuns(async (dir) => {
  const pf = path.join(dir, "prompt.md");
  fs.writeFileSync(pf, "## Task\nHi\n");
  const out = execFileSync("node", [
    RUNS_BIN, "create",
    "--cwd", "/tmp/p",
    "--role", "implementer",
    "--parent-cli", "claude",
    "--parent-attach", "manual",
    "--worker-cli", "codex",
    "--worker-tmux", "o9k-w-1",
    "--prompt-file", pf,
  ], { env: { ...process.env, O9K_RUNS: dir }, encoding: "utf8" });
  assert.match(out, /runId:\s+\S+/);
  const id = out.match(/runId:\s+(\S+)/)[1];
  const c = execFileSync("node", [RUNS_BIN, "classify", id], {
    env: { ...process.env, O9K_RUNS: dir }, encoding: "utf8",
  });
  assert.match(c, /status:\s+watching/);
}));
```

- [ ] **Step 2: Implement CLI `main` with subcommands**

Subcommands:

| cmd | args | behavior |
|---|---|---|
| `create` | `--cwd --role --parent-cli --parent-attach [--parent-session] [--parent-tmux] --worker-cli [--worker-model] [--worker-tmux] --prompt-file [--project]` | createRun; print `runId:` / paths |
| `classify` | `<runId>` | print `status:` + optional `question:` |
| `answer` | `<runId> --file f` or `--text` | writeAnswer |
| `set-status` | `<runId> <status>` | setStatus |
| `wait` | `<runId> [--ceiling-sec N]` | spawn `wait-mailbox.sh` on run mailbox; then classify; print result; exit 0 on signal, 2 on ceiling+watching |
| `resume` | `[--dry-run]` | Task 5–6 |

Wire `wait` to:

```js
import { spawnSync } from "node:child_process";

export function waitMailbox(runId, { ceilingSec = 3600 } = {}) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "wait-mailbox.sh");
  const r = spawnSync(script, [mailboxDir(runId), "--ceiling-sec", String(ceilingSec)], {
    encoding: "utf8",
  });
  const classified = classifyMailbox(runId);
  return { waitExit: r.status ?? 1, classified };
}
```

At end of `runs.mjs`:

```js
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  // parse flags with small helpers mirroring roster.mjs firstPositional/argValue
  ...
}
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main();
```

- [ ] **Step 3: Run all runs tests — PASS**

```bash
node --test runs.test.mjs
bash wait-mailbox.test.sh
```

- [ ] **Step 4: Commit**

```bash
git add plugins/o9k-roster/scripts/runs.mjs plugins/o9k-roster/scripts/runs.test.mjs
git commit -m "$(cat <<'EOF'
feat(roster): runs.mjs CLI — create/classify/answer/wait

EOF
)"
```

---

### Task 5: Resume adapters (pure) + dry-run resume

**Files:**
- Modify: `plugins/o9k-roster/scripts/runs.mjs`
- Modify: `plugins/o9k-roster/scripts/runs.test.mjs`

- [ ] **Step 1: Failing tests for `buildResumePlan`**

```js
import { buildResumePlan, INJECT } from "./runs.mjs";

test("buildResumePlan skips terminal runs", () => {
  const plan = buildResumePlan({
    status: "done",
    runId: "r1",
    cwd: "/tmp/p",
    parent: { attach: "manual" },
    worker: { cli: "codex", tmux: "w1" },
  });
  assert.deepEqual(plan.actions, []);
});

test("buildResumePlan restores worker tmux when missing", () => {
  const plan = buildResumePlan({
    status: "watching",
    runId: "r1",
    cwd: "/tmp/p",
    parent: { attach: "manual", cli: "claude" },
    worker: { cli: "claude", sessionId: "abc", tmux: "w1" },
  }, { tmuxExists: () => false });
  assert.equal(plan.actions[0].kind, "spawn_worker");
  assert.equal(plan.actions[0].tmux, "w1");
  assert.match(plan.actions[0].inject, /Host crash recovery/);
});

test("buildResumePlan noops when worker tmux exists", () => {
  const plan = buildResumePlan({
    status: "watching",
    runId: "r1",
    cwd: "/tmp/p",
    parent: { attach: "manual" },
    worker: { cli: "codex", tmux: "w1" },
  }, { tmuxExists: (n) => n === "w1" });
  assert.deepEqual(plan.actions, []);
});

test("buildResumePlan parent tmux when attach=tmux", () => {
  const plan = buildResumePlan({
    status: "waiting_human",
    runId: "r1",
    cwd: "/tmp/p",
    parent: { attach: "tmux", cli: "claude", sessionId: "p1", tmux: "parent-1" },
    worker: { cli: "codex", tmux: "w1" },
  }, { tmuxExists: () => false });
  const kinds = plan.actions.map((a) => a.kind);
  assert.ok(kinds.includes("spawn_worker"));
  assert.ok(kinds.includes("spawn_parent"));
  assert.match(plan.actions.find((a) => a.kind === "spawn_parent").inject, /human question/);
});
```

- [ ] **Step 2: Implement adapters**

```js
export const INJECT = {
  worker: "Host crash recovery. Read mailbox/STATUS and continue the task. Do not re-init from scratch.",
  parent: (runId) =>
    `Host crash recovery. Read ${path.join(runsRoot(), runId, "STATE.json")}. Continue orchestration; do not re-dispatch if worker tmux is alive.`,
  waitingHuman: " You were blocked on a human question — re-surface it; do not invent an answer.",
};

function defaultTmuxExists(name) {
  try {
    execFileSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Pure-ish: returns { actions: [...] } without spawning. */
export function buildResumePlan(state, { tmuxExists = defaultTmuxExists } = {}) {
  if (["done", "failed", "cancelled"].includes(state.status)) {
    return { actions: [] };
  }
  const actions = [];
  const injectWorker = INJECT.worker;
  let injectParent = INJECT.parent(state.runId);
  if (state.status === "waiting_human") injectParent += INJECT.waitingHuman;

  if (state.worker?.tmux && !tmuxExists(state.worker.tmux)) {
    actions.push({
      kind: "spawn_worker",
      tmux: state.worker.tmux,
      cwd: state.cwd,
      cli: state.worker.cli,
      sessionId: state.worker.sessionId,
      inject: injectWorker,
      promptPath: path.join(runDir(state.runId), "mailbox", "PROMPT.md"),
    });
  }
  if (state.parent?.attach === "tmux" && state.parent.tmux && !tmuxExists(state.parent.tmux)) {
    actions.push({
      kind: "spawn_parent",
      tmux: state.parent.tmux,
      cwd: state.cwd,
      cli: state.parent.cli,
      sessionId: state.parent.sessionId,
      inject: injectParent,
    });
  } else if (state.parent?.attach === "manual") {
    actions.push({ kind: "parent_awaiting_attach", runId: state.runId, sessionId: state.parent.sessionId });
  }
  actions.push({ kind: "flag_reattach_watcher", runId: state.runId });
  return { actions };
}

export function buildCliArgv({ cli, sessionId, inject, promptPath, coldStart }) {
  if (cli === "claude") {
    if (sessionId && !coldStart) return ["claude", "--resume", sessionId];
    return ["claude"]; // inject via paste after start; prompt file for cold
  }
  if (cli === "codex") {
    if (sessionId && !coldStart) return ["codex", "resume", sessionId];
    return ["codex"]; // cold: paste PROMPT later
  }
  // cursor / unknown
  return null; // signal cold_start generic shell
}
```

Note: After `tmux new-session` starts the CLI, resume inject uses the existing roster paste pattern (`load-buffer` + `paste-buffer` + Enter) — implement in Task 6 `executeResumeAction`, not as a fragile `claude --resume id "msg"` one-liner (verified: `--resume` takes optional value; trailing prompt behavior varies).

- [ ] **Step 3: Tests PASS**

```bash
node --test runs.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add plugins/o9k-roster/scripts/runs.mjs plugins/o9k-roster/scripts/runs.test.mjs
git commit -m "$(cat <<'EOF'
feat(roster): buildResumePlan + CLI resume adapters

EOF
)"
```

---

### Task 6: `resumeAll` — lockfile, execute, logging

**Files:**
- Modify: `plugins/o9k-roster/scripts/runs.mjs`
- Modify: `plugins/o9k-roster/scripts/runs.test.mjs`

- [ ] **Step 1: Test lock + dry-run listing**

```js
test("resumeAll dry-run lists actions without tmux", withTempRuns(async (dir) => {
  const s = createRun({
    cwd: "/tmp/p", role: "implementer",
    parent: { cli: "claude", attach: "manual" },
    worker: { cli: "claude", sessionId: "abc", tmux: "o9k-w-dry" },
    prompt: "x",
  });
  setStatus(s.runId, "watching");
  const report = resumeAll({ dryRun: true, tmuxExists: () => false, logDir: dir });
  assert.ok(report.runs.some((r) => r.runId === s.runId));
  assert.ok(report.runs[0].actions.some((a) => a.kind === "spawn_worker"));
}));

test("resumeAll lock prevents concurrent run", withTempRuns(async (dir) => {
  const lock = path.join(dir, ".resume.lock");
  fs.writeFileSync(lock, String(process.pid));
  assert.throws(() => resumeAll({ dryRun: true, logDir: dir }), /lock/);
}));
```

- [ ] **Step 2: Implement `resumeAll` + `executeResumeAction`**

```js
import { execFileSync } from "node:child_process";

export function resumeLockPath() {
  return path.join(runsRoot(), ".resume.lock");
}

export function listActiveStates() {
  const root = runsRoot();
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root)) {
    if (name.startsWith(".")) continue;
    const st = loadState(name);
    if (!st) continue;
    if (["done", "failed", "cancelled"].includes(st.status)) continue;
    out.push(st);
  }
  return out;
}

export function resumeAll({
  dryRun = false,
  tmuxExists = defaultTmuxExists,
  logDir = path.join(os.homedir(), ".o9k/logs"),
  now = new Date(),
} = {}) {
  fs.mkdirSync(runsRoot(), { recursive: true });
  const lock = resumeLockPath();
  if (fs.existsSync(lock)) throw new Error(`resume lock held: ${lock}`);
  fs.writeFileSync(lock, `${process.pid}\n`);
  const report = { at: now.toISOString(), runs: [] };
  try {
    for (const state of listActiveStates()) {
      const plan = buildResumePlan(state, { tmuxExists });
      report.runs.push({ runId: state.runId, status: state.status, actions: plan.actions });
      if (dryRun) continue;
      for (const action of plan.actions) {
        executeResumeAction(action, state);
      }
      // flag reattach
      atomicWriteText(path.join(mailboxDir(state.runId), "REATTACH_WATCHER"), "1\n");
    }
  } finally {
    try { fs.unlinkSync(lock); } catch { /* */ }
  }
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `resume-${now.toISOString().replace(/[:.]/g, "-")}.log`);
  fs.writeFileSync(logFile, `${JSON.stringify(report, null, 2)}\n`);
  report.logFile = logFile;
  return report;
}

function shellQuote(s) {
  return /^[A-Za-z0-9_\-./=]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

export function executeResumeAction(action, state) {
  if (action.kind === "parent_awaiting_attach" || action.kind === "flag_reattach_watcher") {
    return;
  }
  if (action.kind !== "spawn_worker" && action.kind !== "spawn_parent") return;

  let argv = buildCliArgv({
    cli: action.cli,
    sessionId: action.sessionId,
    inject: action.inject,
    promptPath: action.promptPath,
    coldStart: !action.sessionId,
  });
  if (!argv) {
    // unknown CLI cold start: bash -lc "cat PROMPT | …" — for v1 start `bash` and paste later
    argv = ["bash", "-lc", `echo 'cold_start run ${state.runId}; read PROMPT at ${action.promptPath}'; exec ${shellQuote(action.cli || "bash")}'`];
    state.recovery = "cold_start";
    saveState(state);
  }
  const cmd = argv.map(shellQuote).join(" ");
  execFileSync("tmux", ["new-session", "-d", "-s", action.tmux, "-c", action.cwd, cmd], {
    stdio: "ignore",
  });
  // paste inject (Hermes pattern)
  const tmp = path.join(os.tmpdir(), `o9k-inject-${action.tmux}.txt`);
  fs.writeFileSync(tmp, action.inject);
  try {
    execFileSync("bash", ["-lc", `tmux load-buffer -b o9k ${shellQuote(tmp)} && tmux paste-buffer -b o9k -t ${shellQuote(action.tmux)} && sleep 0.3 && tmux send-keys -t ${shellQuote(action.tmux)} Enter`], {
      stdio: "ignore",
    });
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* */ }
  }
}
```

Wire CLI: `node runs.mjs resume [--dry-run]`.

- [ ] **Step 3: Tests PASS** (dry-run + lock only; no real tmux required)

```bash
node --test runs.test.mjs
```

- [ ] **Step 4: Optional manual smoke (not in CI)**

```bash
O9K_RUNS=/tmp/o9k-runs-smoke node runs.mjs create ... 
O9K_RUNS=/tmp/o9k-runs-smoke node runs.mjs resume --dry-run
```

- [ ] **Step 5: Commit**

```bash
git add plugins/o9k-roster/scripts/runs.mjs plugins/o9k-roster/scripts/runs.test.mjs
git commit -m "$(cat <<'EOF'
feat(roster): agentless resumeAll with lockfile and tmux recreate

EOF
)"
```

---

### Task 7: systemd unit + worker PROMPT template

**Files:**
- Create: `plugins/o9k-roster/systemd/o9k-resume.service`
- Create: `plugins/o9k-roster/templates/worker-prompt.md`
- Modify: `docs/MULTI-AGENT.md` (short section)

- [ ] **Step 1: Unit file**

```ini
[Unit]
Description=o9k agentless cross-CLI run resume after boot
After=default.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env node %h/projects/o9k/plugins/o9k-roster/scripts/runs.mjs resume
# Prefer a stable path after install — o9k-init should rewrite ExecStart to the
# marketplace-installed plugin path. Until then, document symlink:
#   mkdir -p ~/.local/bin && ln -sf .../runs.mjs ~/.local/bin/o9k-runs
# ExecStart=%h/.local/bin/o9k-runs resume

[Install]
WantedBy=default.target
```

- [ ] **Step 2: Worker prompt template** (HEARTBEAT mandatory)

```markdown
# Worker task (mailbox protocol)

Run directory: `{{RUN_DIR}}`
Mailbox: `{{RUN_DIR}}/mailbox/`

## Protocol (mandatory)
1. On start: write `mailbox/STATUS` = `watching`. Touch `mailbox/HEARTBEAT` with UTC ISO now.
2. Every ~5 minutes of work (and after each meaningful step): update `HEARTBEAT`.
3. Need a human/parent decision: write `mailbox/QUESTIONS.md`, set `STATUS=waiting_human`, update HEARTBEAT, then wait for `mailbox/ANSWER.md` (do not exit).
4. Finished: write `mailbox/RESULT.md` (outcome, commits, tests), set `STATUS=done`.
5. Hard failure: `STATUS=failed` and explain in RESULT.md.

## Task
{{TASK_BODY}}
```

- [ ] **Step 3: Document in `docs/MULTI-AGENT.md`**

Add section **Cross-CLI runs (mailbox + resume)** summarizing: create → watcher `runs wait` → return/respawn → `runs resume` at boot. Link spec + template.

- [ ] **Step 4: Commit**

```bash
git add plugins/o9k-roster/systemd/o9k-resume.service \
  plugins/o9k-roster/templates/worker-prompt.md docs/MULTI-AGENT.md
git commit -m "$(cat <<'EOF'
docs(roster): worker mailbox template + o9k-resume systemd unit

EOF
)"
```

---

### Task 8: Skill contract (parent + watcher) + CHANGELOG

**Files:**
- Modify: `plugins/o9k-roster/skills/roster/SKILL.md`
- Modify: `CHANGELOG.md`
- Modify: `plugins/o9k-roster/.claude-plugin/plugin.json` description if needed

- [ ] **Step 1: Append to roster skill** (English, tight)

Add sections:

```markdown
## Cross-CLI runs (mailbox watcher)

When delegating to an external CLI in tmux:

1. `node …/runs.mjs create … --prompt-file …` (include template protocol).
2. Start worker tmux (roster dispatch or manual) with that PROMPT; set worker.tmux in STATE if create did not.
3. Spawn an **internal cheap subagent** whose only job:
   - `node …/runs.mjs wait <runId>`  (ONE blocking call — do not poll in a model loop)
   - Return the printed `status` (`question|done|failed|watching`) to the parent; then exit.
4. Parent on `question`: answer or ask human → `node …/runs.mjs answer <runId> --text "…"` → **respawn** the watcher (step 3).
5. Parent on `done`/`failed`: read RESULT; TIM closeout only if semantically useful.
6. After host reboot: `runs.mjs resume` (systemd). If `REATTACH_WATCHER` exists, respawn watcher; do not double-dispatch if worker tmux lives.

Never use `claude --resume` as a live worker→parent callback.
Never LLM-poll every few seconds.
```

- [ ] **Step 2: CHANGELOG entry under Unreleased / date**

- [ ] **Step 3: Commit**

```bash
git add plugins/o9k-roster/skills/roster/SKILL.md CHANGELOG.md \
  plugins/o9k-roster/.claude-plugin/plugin.json
git commit -m "$(cat <<'EOF'
docs(roster): watcher return/respawn contract + changelog

EOF
)"
```

---

### Task 9: Wire optional `roster dispatch --run-id` (thin) + final verification

**Files:**
- Modify: `plugins/o9k-roster/scripts/roster.mjs` (optional flag)
- Modify: `plugins/o9k-roster/scripts/roster.test.mjs` only if pure helpers change

- [ ] **Step 1: After successful `spawnInTmux`, if `--run-id` passed, update that run’s worker.tmux/session and `setStatus(watching)`**

Keep YAGNI: if flag absent, dispatch unchanged.

```js
// in cmdDispatch after spawn:
const runId = argValue(args, "--run-id");
if (runId) {
  const { loadState, saveState, setStatus } = await import("./runs.mjs");
  const st = loadState(runId);
  if (st) {
    st.worker.tmux = session;
    st.watcher.attached = true;
    saveState(st);
    setStatus(runId, "watching");
  }
}
```

- [ ] **Step 2: Full test suite**

```bash
cd /home/bbbee/projects/o9k/plugins/o9k-roster/scripts
node --test runs.test.mjs roster.test.mjs
bash wait-mailbox.test.sh
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/o9k-roster/scripts/roster.mjs plugins/o9k-roster/scripts/roster.test.mjs
git commit -m "$(cat <<'EOF'
feat(roster): dispatch --run-id links tmux session to run registry

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `~/.o9k/runs` + STATE + mailbox | 1–2 |
| Atomic STATE writes | 1 |
| HEARTBEAT via PROMPT template | 7 |
| classify question/done/failed | 2 |
| Watcher return on question + respawn (skill) | 8 |
| Blocking wait (no LLM poll) | 3–4 |
| Parent answer → ANSWER.md | 2, 4, 8 |
| Agentless resume all active | 5–6 |
| Parent attach manual vs tmux | 5 |
| Inject templates | 5–6 |
| Lockfile | 6 |
| systemd unit | 7 |
| TIM narrow (docs only) | 8 |
| Hermes prior art referenced in skill/docs | 7–8 |

## Out of scope for this plan (follow-ups)

- Patching Hermes `orchestrator` / `overseer` skills in `~/.hermes` (separate PR/task).
- `/o9k-init` auto-enable of systemd (document manual enable in MULTI-AGENT; init wiring later).
- Perfect Cursor session resume IDs.
- Pane-scrape fallback heuristics from Hermes (mailbox-first only in v1).
