import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAgentProcessCmdline,
  isCollectorCmdline,
  countAgentProcesses,
  parsePsTable,
} from "./usage-procs.mjs";

test("isCollectorCmdline detects usage probes", () => {
  assert.equal(isCollectorCmdline("claude -p /usage"), true);
  assert.equal(isCollectorCmdline("node usage-collect.mjs --cli claude"), true);
  assert.equal(isCollectorCmdline("claude --model opus"), false);
});

test("isAgentProcessCmdline excludes mcp-server and collectors", () => {
  assert.equal(isAgentProcessCmdline("node mcp-server.js claude", "claude"), false);
  assert.equal(isAgentProcessCmdline("/usr/bin/claude --model sonnet", "claude"), true);
  assert.equal(isAgentProcessCmdline("claude -p /usage", "claude"), false);
  assert.equal(isAgentProcessCmdline("/usr/bin/codex exec foo", "codex"), true);
  assert.equal(isAgentProcessCmdline("/usr/bin/cursor-agent -p hi", "cursor"), true);
});

test("countAgentProcesses uses fixture cmdlines", () => {
  const map = {
    1: "/usr/bin/claude --model sonnet",
    2: "node @anthropic/mcp-server",
    3: "claude -p /usage",
    4: "/usr/bin/codex",
    5: "/usr/bin/cursor-agent",
  };
  const counts = countAgentProcesses({
    listPids: () => [1, 2, 3, 4, 5],
    readCmdline: (pid) => map[pid],
  });
  assert.equal(counts.claude, 1);
  assert.equal(counts.codex, 1);
  assert.equal(counts.cursor, 1);
});

// macOS/BSD fallback: no /proc — pid→cmdline comes from one `ps -axo` snapshot.
test("parsePsTable parses ps -axo pid=,command= output", () => {
  const table = parsePsTable(
    "    1 /sbin/launchd\n" +
    "  501 /usr/bin/claude --model sonnet\n" +
    " 6502 env O9K_USAGE_COLLECT=1 TERM=xterm-256color claude\n" +
    "garbage line without pid\n" +
    ""
  );
  assert.equal(table.size, 3);
  assert.equal(table.get(501), "/usr/bin/claude --model sonnet");
  assert.equal(
    isCollectorCmdline(table.get(6502)),
    true,
    "collector spawns are still excluded via the cmdline env marker"
  );
});

test("countAgentProcesses excludes processes with O9K_USAGE_COLLECT in environ", () => {
  const counts = countAgentProcesses({
    listPids: () => [10],
    readCmdline: () => "/usr/bin/claude --model sonnet",
    hasEnvMarker: () => true,
  });
  assert.equal(counts.claude, 0);
});
