#!/usr/bin/env node
// o9k-stats.mjs — token usage report from Claude Code session transcripts.
//
// Usage: node o9k-stats.mjs [project-dir]     (default: cwd)
//
// Reads ~/.claude/projects/<encoded-project>/*.jsonl and aggregates the
// per-message `usage` fields. Zero dependencies. Read-only.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const projectDir = path.resolve(process.argv[2] || process.cwd());
// Claude Code encodes the project path by replacing path separators (and dots) with '-'
const encoded = projectDir.replace(/[\\/.:]/g, "-");
const logDir = path.join(os.homedir(), ".claude", "projects", encoded);

if (!fs.existsSync(logDir)) {
  console.error(`No Claude Code transcripts found for ${projectDir}`);
  console.error(`(looked in ${logDir})`);
  process.exit(1);
}

const files = fs.readdirSync(logDir).filter((f) => f.endsWith(".jsonl"));
const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0, sessions: 0 };

for (const file of files) {
  let sawUsage = false;
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(logDir, file)),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    let u;
    try {
      u = JSON.parse(line)?.message?.usage;
    } catch {
      continue;
    }
    if (!u) continue;
    sawUsage = true;
    totals.turns++;
    totals.input += u.input_tokens ?? 0;
    totals.output += u.output_tokens ?? 0;
    totals.cacheRead += u.cache_read_input_tokens ?? 0;
    totals.cacheWrite += u.cache_creation_input_tokens ?? 0;
  }
  if (sawUsage) totals.sessions++;
}

const fmt = (n) => n.toLocaleString("en-US");
const ctxFed = totals.input + totals.cacheRead + totals.cacheWrite;
const outShare = ctxFed + totals.output > 0 ? ((totals.output / (ctxFed + totals.output)) * 100).toFixed(1) : "0";

console.log(`o9k-stats — ${projectDir}`);
console.log(`sessions: ${totals.sessions}   assistant turns: ${fmt(totals.turns)}`);
console.log(``);
console.log(`output tokens:        ${fmt(totals.output)}`);
console.log(`fresh input tokens:   ${fmt(totals.input)}`);
console.log(`cache read tokens:    ${fmt(totals.cacheRead)}`);
console.log(`cache write tokens:   ${fmt(totals.cacheWrite)}`);
console.log(``);
console.log(`output share of total traffic: ${outShare}%`);
console.log(`avg output/turn: ${totals.turns ? fmt(Math.round(totals.output / totals.turns)) : 0} tokens`);
console.log(``);
console.log(`Reminder: every output token is re-read as input on later turns —`);
console.log(`compressing output (caveman) compounds across the whole session.`);
