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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // CLI subcommands added in later tasks.
}
