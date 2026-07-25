#!/usr/bin/env node
// Thin o9k adapter — implementation owned by standalone team-up.
import { pathToFileURL } from "node:url";
import { importTeamUp } from "./team-up-load.mjs";
import { runTeamUpCli } from "./team-up-adapter.mjs";

const __mod = await importTeamUp("src/runs/runs.mjs");
export const {
  INJECT,
  acquireResumeLock,
  atomicWriteJson,
  atomicWriteText,
  buildCliArgv,
  buildColdStartArgv,
  buildResumePlan,
  captureTmuxPane,
  classifyMailbox,
  createRun,
  executeResumeAction,
  isPidAlive,
  linkDispatchToRun,
  listActiveStates,
  loadState,
  mailboxDir,
  packageRoot,
  pasteInject,
  promptHasMailboxProtocol,
  resumeAll,
  resumeLockPath,
  rosterPluginRoot,
  runDir,
  runsRoot,
  saveState,
  setStatus,
  shellQuote,
  validateResult,
  waitMailbox,
  waitTmuxReady,
  wrapPromptWithMailboxProtocol,
  writeAnswer,
  writeTypedResult
} = __mod;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runTeamUpCli("runs", process.argv.slice(2));
  process.exit(code);
}
