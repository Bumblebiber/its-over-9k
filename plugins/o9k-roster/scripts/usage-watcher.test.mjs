import { test } from "node:test";
import assert from "node:assert/strict";
import { planCollect, advanceSchedule, computeState } from "./usage-watcher.mjs";

const NOW = Date.parse("2026-07-17T12:00:00Z");
const subs = ["claude", "codex", "cursor"];
const DEFAULT_CONFIG = {
  tick_sec: 60,
  intervals: { idle_heartbeat_hours: 24, active_min: 20, busy_min: 8 },
};

test("computeState idle/active/busy", () => {
  assert.equal(computeState({ claude: 0, codex: 0, cursor: 0 }), "idle");
  assert.equal(computeState({ claude: 1, codex: 0, cursor: 0 }), "active");
  assert.equal(computeState({ claude: 1, codex: 1, cursor: 0 }), "busy");
});

test("planCollect on rise collects risen cli", () => {
  const d = planCollect({
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

test("planCollect ignores transitions while collecting flag set", () => {
  const d = planCollect({
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

test("advanceSchedule only journals successful collects", () => {
  const next = advanceSchedule({
    successful: ["claude"],
    state: "idle",
    lastCollect: { claude: null, codex: null, cursor: null },
    nextDue: { claude: null, codex: null, cursor: null },
    now: NOW,
    config: DEFAULT_CONFIG,
  });
  assert.ok(next.last_collect.claude);
  assert.equal(next.last_collect.codex, null);
});

test("idle heartbeat does not re-fire within 24h after successful advance", () => {
  const first = planCollect({
    counts: { claude: 0, codex: 0, cursor: 0 },
    prevCounts: { claude: 0, codex: 0, cursor: 0 },
    state: "idle",
    collecting: { claude: false, codex: false, cursor: false },
    lastCollect: { claude: null, codex: null, cursor: null },
    nextDue: { claude: null, codex: null, cursor: null },
    now: NOW,
    subscriptions: subs,
  });
  assert.equal(first.collect.length, 3);

  const advanced = advanceSchedule({
    successful: first.collect,
    state: first.state,
    lastCollect: { claude: null, codex: null, cursor: null },
    nextDue: { claude: null, codex: null, cursor: null },
    now: NOW,
    config: DEFAULT_CONFIG,
  });

  const second = planCollect({
    counts: { claude: 0, codex: 0, cursor: 0 },
    prevCounts: { claude: 0, codex: 0, cursor: 0 },
    state: "idle",
    collecting: { claude: false, codex: false, cursor: false },
    lastCollect: advanced.last_collect,
    nextDue: advanced.next_due,
    now: NOW + 60_000,
    subscriptions: subs,
  });
  assert.deepEqual(second.collect, []);
});

test("failed collect does not advance idle heartbeat schedule", () => {
  const first = planCollect({
    counts: { claude: 0, codex: 0, cursor: 0 },
    prevCounts: { claude: 0, codex: 0, cursor: 0 },
    state: "idle",
    collecting: { claude: false, codex: false, cursor: false },
    lastCollect: { claude: null, codex: null, cursor: null },
    nextDue: { claude: null, codex: null, cursor: null },
    now: NOW,
    subscriptions: subs,
  });
  const advanced = advanceSchedule({
    successful: [],
    state: first.state,
    lastCollect: { claude: null, codex: null, cursor: null },
    nextDue: { claude: null, codex: null, cursor: null },
    now: NOW,
    config: DEFAULT_CONFIG,
  });
  const retry = planCollect({
    counts: { claude: 0, codex: 0, cursor: 0 },
    prevCounts: { claude: 0, codex: 0, cursor: 0 },
    state: "idle",
    collecting: { claude: false, codex: false, cursor: false },
    lastCollect: advanced.last_collect,
    nextDue: advanced.next_due,
    now: NOW + 60_000,
    subscriptions: subs,
  });
  assert.equal(retry.collect.length, 3);
});
