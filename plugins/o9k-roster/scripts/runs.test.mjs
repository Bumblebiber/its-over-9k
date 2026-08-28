import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runsRoot, runDir, atomicWriteJson, atomicWriteText, createRun, loadState,
  classifyMailbox, writeAnswer, buildResumePlan, INJECT, buildCliArgv,
  setStatus, resumeAll, linkDispatchToRun, listActiveStates,
  buildColdStartArgv, acquireResumeLock, resumeLockPath, waitTmuxReady,
} from "./runs.mjs";

const RUNS_BIN = fileURLToPath(new URL("./runs.mjs", import.meta.url));

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

test("classifyMailbox skips question when ANSWER is newer", withTempRuns(async () => {
  const s = createRun({
    cwd: "/tmp/p", role: "implementer",
    parent: { cli: "claude", attach: "manual" },
    worker: { cli: "codex", tmux: "t1" },
    prompt: "x",
  });
  const mb = path.join(runDir(s.runId), "mailbox");
  atomicWriteText(path.join(mb, "QUESTIONS.md"), "Which DB?\n");
  // ensure ANSWER is strictly newer
  const t0 = Date.now();
  while (Date.now() <= t0) { /* spin */ }
  atomicWriteText(path.join(mb, "ANSWER.md"), "<!-- source: parent -->\nSQLite\n");
  atomicWriteText(path.join(mb, "STATUS"), "waiting_human");
  assert.equal(classifyMailbox(s.runId).status, "watching");
}));

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

test("CLI answer then classify watching", withTempRuns(async (dir) => {
  const pf = path.join(dir, "prompt.md");
  fs.writeFileSync(pf, "x\n");
  const out = execFileSync("node", [
    RUNS_BIN, "create", "--cwd", "/tmp/p", "--role", "implementer",
    "--parent-cli", "claude", "--parent-attach", "manual",
    "--worker-cli", "codex", "--worker-tmux", "t1", "--prompt-file", pf,
  ], { env: { ...process.env, O9K_RUNS: dir }, encoding: "utf8" });
  const id = out.match(/runId:\s+(\S+)/)[1];
  const mb = path.join(dir, id, "mailbox");
  fs.writeFileSync(path.join(mb, "QUESTIONS.md"), "Q?\n");
  fs.writeFileSync(path.join(mb, "STATUS"), "waiting_human\n");
  execFileSync("node", [RUNS_BIN, "answer", id, "--text", "A"], {
    env: { ...process.env, O9K_RUNS: dir }, encoding: "utf8",
  });
  const c = execFileSync("node", [RUNS_BIN, "classify", id], {
    env: { ...process.env, O9K_RUNS: dir }, encoding: "utf8",
  });
  assert.match(c, /status:\s+watching/);
}));

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

test("buildResumePlan noops worker when tmux exists", () => {
  const plan = buildResumePlan({
    status: "watching",
    runId: "r1",
    cwd: "/tmp/p",
    parent: { attach: "manual", cli: "claude" },
    worker: { cli: "codex", tmux: "w1" },
  }, { tmuxExists: (n) => n === "w1" });
  assert.ok(!plan.actions.some((a) => a.kind === "spawn_worker"));
  assert.ok(plan.actions.some((a) => a.kind === "parent_awaiting_attach"));
  assert.ok(plan.actions.some((a) => a.kind === "flag_reattach_watcher"));
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

test("buildCliArgv claude resume", () => {
  assert.deepEqual(buildCliArgv({ cli: "claude", sessionId: "abc", coldStart: false }), ["claude", "--resume", "abc"]);
  assert.equal(buildCliArgv({ cli: "cursor", sessionId: null, coldStart: true }), null);
});

test("buildColdStartArgv has no stray quote after exec", () => {
  const argv = buildColdStartArgv({
    runId: "r1",
    promptPath: "/tmp/run/mailbox/PROMPT.md",
    cli: "cursor-agent",
  });
  assert.equal(argv[0], "bash");
  assert.equal(argv[1], "-lc");
  assert.match(argv[2], /exec cursor-agent$/);
  assert.doesNotMatch(argv[2], /exec cursor-agent'/);
  assert.match(argv[2], /PROMPT\.md/);
});

test("buildColdStartArgv quotes cli with spaces", () => {
  const argv = buildColdStartArgv({ runId: "r1", promptPath: "/p", cli: "my cli" });
  assert.match(argv[2], /exec 'my cli'$/);
});

test("INJECT.worker mentions PROMPT.md", () => {
  assert.match(INJECT.worker, /PROMPT\.md/);
});

test("waitTmuxReady returns true when pane non-empty", () => {
  let calls = 0;
  const ok = waitTmuxReady("sess", {
    timeoutMs: 1000,
    intervalMs: 10,
    capture: () => {
      calls++;
      return calls >= 2 ? "❯ ready\n" : "";
    },
    sleep: () => {},
  });
  assert.equal(ok, true);
  assert.ok(calls >= 2);
});

test("waitTmuxReady returns false on timeout", () => {
  const ok = waitTmuxReady("sess", {
    timeoutMs: 30,
    intervalMs: 10,
    capture: () => "",
    sleep: () => {},
  });
  assert.equal(ok, false);
});

test("listActiveStates skips corrupt STATE.json", withTempRuns(async (dir) => {
  const s = createRun({
    cwd: "/tmp/p", role: "implementer",
    parent: { cli: "claude", attach: "manual" },
    worker: { cli: "codex", tmux: "t1" },
    prompt: "x",
  });
  setStatus(s.runId, "watching");
  const bad = path.join(dir, "corrupt-run");
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, "STATE.json"), "{not-json");
  const skipped = [];
  const active = listActiveStates({ onCorrupt: (id, e) => skipped.push(id) });
  assert.ok(active.some((r) => r.runId === s.runId));
  assert.ok(skipped.includes("corrupt-run"));
  // resumeAll must not throw
  const report = resumeAll({ dryRun: true, tmuxExists: () => true, logDir: dir });
  assert.ok(report.runs.some((r) => r.runId === s.runId));
}));

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
  assert.ok(report.logFile && fs.existsSync(report.logFile));
}));

test("resumeAll lock prevents concurrent run", withTempRuns(async (dir) => {
  const lock = path.join(dir, ".resume.lock");
  fs.writeFileSync(lock, String(process.pid));
  assert.throws(() => resumeAll({ dryRun: true, logDir: dir }), /lock/);
}));

test("resumeAll steals stale lock from dead pid", withTempRuns(async (dir) => {
  const lock = resumeLockPath();
  fs.writeFileSync(lock, "2147483646\n"); // almost certainly dead
  const report = resumeAll({ dryRun: true, tmuxExists: () => true, logDir: dir });
  assert.ok(report.logFile);
  assert.ok(!fs.existsSync(lock)); // released in finally
}));

test("acquireResumeLock steals then holds", withTempRuns(async (dir) => {
  const lock = path.join(dir, ".resume.lock");
  fs.writeFileSync(lock, "2147483646\n");
  acquireResumeLock(lock);
  assert.equal(fs.readFileSync(lock, "utf8").trim(), String(process.pid));
  assert.throws(() => acquireResumeLock(lock), /lock held/);
  fs.unlinkSync(lock);
}));

test("linkDispatchToRun sets worker.tmux and watching", withTempRuns(async () => {
  const s = createRun({
    cwd: "/tmp/p", role: "implementer",
    parent: { cli: "claude", attach: "manual" },
    worker: { cli: "codex", tmux: null },
    prompt: "x",
  });
  assert.equal(linkDispatchToRun(s.runId, "o9k-sess-1"), true);
  const st = loadState(s.runId);
  assert.equal(st.worker.tmux, "o9k-sess-1");
  assert.equal(st.status, "watching");
  assert.equal(st.watcher.attached, true);
}));

test("CLI wait ceiling returns exit 2", withTempRuns(async (dir) => {
  const pf = path.join(dir, "prompt.md");
  fs.writeFileSync(pf, "x\n");
  const out = execFileSync("node", [
    RUNS_BIN, "create", "--cwd", "/tmp/p", "--role", "implementer",
    "--parent-cli", "claude", "--parent-attach", "manual",
    "--worker-cli", "codex", "--worker-tmux", "t1", "--prompt-file", pf,
  ], { env: { ...process.env, O9K_RUNS: dir }, encoding: "utf8" });
  const id = out.match(/runId:\s+(\S+)/)[1];
  try {
    execFileSync("node", [RUNS_BIN, "wait", id, "--ceiling-sec", "2"], {
      env: { ...process.env, O9K_RUNS: dir }, encoding: "utf8",
    });
    assert.fail("expected non-zero exit");
  } catch (e) {
    assert.equal(e.status, 2);
  }
}));
