import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeHooksJson, mergeCursorHooksJson } from "./hook-merge.mjs";

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

test("mergeHooksJson is idempotent when patch unchanged", () => {
  const existing = {
    hooks: {
      SessionStart: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "bash /tmp/foreign.sh" }],
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
  const once = mergeHooksJson(existing, patch);
  const twice = mergeHooksJson(once, patch);
  assert.deepEqual(twice, once);
});

test("mergeCursorHooksJson replaces prior o9k entries only", () => {
  const existing = {
    version: 1,
    hooks: {
      sessionStart: [
        { command: "bash /tmp/foreign.sh" },
        { command: "bash /x/run-o9k-hook.sh core/session-start" },
      ],
    },
  };
  const patch = {
    version: 1,
    hooks: {
      sessionStart: [{ command: "bash /new/run-o9k-hook.sh core/session-start" }],
    },
  };
  const out = mergeCursorHooksJson(existing, patch);
  const cmds = out.hooks.sessionStart.map((h) => h.command);
  assert.ok(cmds.some((c) => c.includes("foreign.sh")));
  assert.equal(cmds.filter((c) => c.includes("run-o9k-hook")).length, 1);
  assert.ok(cmds.some((c) => c.includes("/new/run-o9k-hook")));
});

test("mergeCursorHooksJson is idempotent when patch unchanged", () => {
  const existing = {
    version: 1,
    hooks: {
      sessionStart: [{ command: "bash /tmp/foreign.sh" }],
    },
  };
  const patch = {
    version: 1,
    hooks: {
      sessionStart: [{ command: "bash /new/run-o9k-hook.sh core/session-start" }],
    },
  };
  const once = mergeCursorHooksJson(existing, patch);
  const twice = mergeCursorHooksJson(once, patch);
  assert.deepEqual(twice, once);
});
