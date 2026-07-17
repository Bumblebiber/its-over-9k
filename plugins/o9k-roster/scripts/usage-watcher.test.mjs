import { test } from "node:test";
import assert from "node:assert/strict";
import { decideCollect, computeState } from "./usage-watcher.mjs";

const NOW = Date.parse("2026-07-17T12:00:00Z");
const subs = ["claude", "codex", "cursor"];

test("computeState idle/active/busy", () => {
  assert.equal(computeState({ claude: 0, codex: 0, cursor: 0 }), "idle");
  assert.equal(computeState({ claude: 1, codex: 0, cursor: 0 }), "active");
  assert.equal(computeState({ claude: 1, codex: 1, cursor: 0 }), "busy");
});

test("decideCollect on rise collects risen cli", () => {
  const d = decideCollect({
    counts: { claude: 1, codex: 0, cursor: 0 },
    prevCounts: { claude: 0, codex: 0, cursor: 0 },
    state: "active",
    collecting: { claude: false, codex: false, cursor: false },
    lastCollect: { claude: null, codex: null, cursor: null },
    nextDue: { claude: null, codex: null, cursor: null },
    now: NOW,
    subscriptions: subs,
  });
  assert.ok(d.collect.includes("claude"));
});

test("decideCollect ignores transitions while collecting flag set", () => {
  const d = decideCollect({
    counts: { claude: 0, codex: 0, cursor: 0 },
    prevCounts: { claude: 1, codex: 0, cursor: 0 },
    state: "idle",
    collecting: { claude: true, codex: false, cursor: false },
    lastCollect: { claude: "2026-07-17T11:00:00Z", codex: null, cursor: null },
    nextDue: { claude: null, codex: null, cursor: null },
    now: NOW,
    subscriptions: subs,
  });
  assert.equal(d.collect.includes("claude"), false);
});
