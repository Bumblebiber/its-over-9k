#!/usr/bin/env node
// runs.mjs — disk-first cross-CLI run registry + mailbox + agentless resume.
// State: ~/.o9k/runs/<runId>/ (O9K_RUNS override). Zero dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // CLI subcommands added in later tasks.
}
