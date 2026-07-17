#!/usr/bin/env node
// runs.mjs — disk-first cross-CLI run registry + mailbox + agentless resume.
// State: ~/.o9k/runs/<runId>/ (O9K_RUNS override). Zero dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

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

/** Returns { actions: [...] } without spawning. */
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

export function buildCliArgv({ cli, sessionId, coldStart }) {
  if (cli === "claude") {
    if (sessionId && !coldStart) return ["claude", "--resume", sessionId];
    return ["claude"];
  }
  if (cli === "codex") {
    if (sessionId && !coldStart) return ["codex", "resume", sessionId];
    return ["codex"];
  }
  return null; // unknown → cold_start signal
}

export function waitMailbox(runId, { ceilingSec = 3600 } = {}) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "wait-mailbox.sh");
  const r = spawnSync(script, [mailboxDir(runId), "--ceiling-sec", String(ceilingSec)], { encoding: "utf8" });
  const classified = classifyMailbox(runId);
  return { waitExit: r.status ?? 1, classified };
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function printClassified(c) {
  console.log(`status: ${c.status}`);
  if (c.question) console.log(`question: ${c.question}`);
}

function cmdCreate(args) {
  const promptFile = argValue(args, "--prompt-file");
  const cwd = argValue(args, "--cwd");
  const role = argValue(args, "--role");
  const parentCli = argValue(args, "--parent-cli");
  const parentAttach = argValue(args, "--parent-attach");
  const workerCli = argValue(args, "--worker-cli");
  if (!cwd || !role || !parentCli || !parentAttach || !workerCli || !promptFile) {
    console.error(
      "usage: runs.mjs create --cwd <dir> --role <role> --parent-cli <cli> --parent-attach <mode>"
      + " [--parent-session <id>] [--parent-tmux <name>] --worker-cli <cli>"
      + " [--worker-model <model>] [--worker-tmux <name>] --prompt-file <file> [--project <id>]",
    );
    process.exit(1);
  }
  const prompt = fs.readFileSync(promptFile, "utf8");
  const state = createRun({
    cwd,
    project: argValue(args, "--project"),
    role,
    parent: {
      cli: parentCli,
      sessionId: argValue(args, "--parent-session"),
      tmux: argValue(args, "--parent-tmux"),
      attach: parentAttach,
    },
    worker: {
      cli: workerCli,
      model: argValue(args, "--worker-model"),
      tmux: argValue(args, "--worker-tmux"),
    },
    prompt,
  });
  console.log(`runId: ${state.runId}`);
  console.log(`dir: ${runDir(state.runId)}`);
  console.log(`mailbox: ${mailboxDir(state.runId)}`);
}

function cmdClassify(args) {
  const runId = args[0];
  if (!runId) {
    console.error("usage: runs.mjs classify <runId>");
    process.exit(1);
  }
  printClassified(classifyMailbox(runId));
}

function cmdAnswer(args) {
  const runId = args[0];
  const text = argValue(args, "--text");
  const file = argValue(args, "--file");
  if (!runId || (!text && !file)) {
    console.error("usage: runs.mjs answer <runId> --text <text> | --file <path>");
    process.exit(1);
  }
  const body = text ?? fs.readFileSync(file, "utf8");
  writeAnswer(runId, body);
}

function cmdSetStatus(args) {
  const [runId, status] = args;
  if (!runId || !status) {
    console.error("usage: runs.mjs set-status <runId> <status>");
    process.exit(1);
  }
  setStatus(runId, status);
}

function cmdWait(args) {
  const runId = args[0];
  const ceilingRaw = argValue(args, "--ceiling-sec");
  if (!runId) {
    console.error("usage: runs.mjs wait <runId> [--ceiling-sec N]");
    process.exit(1);
  }
  const ceilingSec = ceilingRaw ? Number(ceilingRaw) : 3600;
  const { waitExit, classified } = waitMailbox(runId, { ceilingSec });
  printClassified(classified);
  process.exitCode = waitExit;
}

const HANDLERS = {
  create: cmdCreate,
  classify: cmdClassify,
  answer: cmdAnswer,
  "set-status": cmdSetStatus,
  wait: cmdWait,
};

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const handler = HANDLERS[cmd];
  if (!handler) {
    console.error(`usage: runs.mjs <${Object.keys(HANDLERS).join("|")}> [options]`);
    process.exit(1);
  }
  handler(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
