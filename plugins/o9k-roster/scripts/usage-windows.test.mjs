import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseResetAt,
  windowIsBlocking,
  modelUsageGate,
  isCliUsageFresh,
} from "./usage-windows.mjs";

const NOW = Date.parse("2026-07-17T12:00:00Z");

test("parseResetAt parses ISO and codex-style reset strings", () => {
  assert.equal(parseResetAt("2026-07-23T17:26:00Z", NOW), Date.parse("2026-07-23T17:26:00Z"));
  const codex = parseResetAt("17:26 on 23 Jul", NOW);
  assert.ok(codex > NOW);
});

test("windowIsBlocking ignores windows past resets_at", () => {
  const usage = {
    windows: {
      "codex:weekly": { used: 1.0, resets_at: "2026-07-16T10:00:00Z" },
    },
  };
  assert.equal(windowIsBlocking("codex:weekly", usage, 0.95, NOW), false);
});

test("modelUsageGate falls back to provider when model has no window data", () => {
  const usage = {
    windows: { "claude:5h": { used: 0.1 } },
    providers: { openai: { used: 0.99 } },
  };
  const gate = modelUsageGate({
    usage,
    limitWindows: ["codex:weekly"],
    provider: "openai",
    cli: "codex",
    handoffAt: 0.95,
    now: NOW,
  });
  assert.equal(gate.blocked, true);
  assert.match(gate.reason, /provider openai/);
});

test("modelUsageGate blocks only this model's windows when present", () => {
  const usage = {
    windows: {
      "claude:fable-week": { used: 0.99 },
      "claude:5h": { used: 0.1 },
    },
  };
  const hot = modelUsageGate({
    usage,
    limitWindows: ["claude:fable-week", "claude:5h"],
    provider: "anthropic",
    cli: "claude",
    handoffAt: 0.95,
    now: NOW,
  });
  const cool = modelUsageGate({
    usage,
    limitWindows: ["claude:5h"],
    provider: "anthropic",
    cli: "claude",
    handoffAt: 0.95,
    now: NOW,
  });
  assert.equal(hot.blocked, true);
  assert.equal(cool.blocked, false);
});

test("isCliUsageFresh respects per-cli window updated timestamps", () => {
  const usage = {
    windows: {
      "claude:5h": { used: 0.1, updated: "2026-07-17T11:58:00Z" },
      "codex:weekly": { used: 0.5, updated: "2026-07-17T10:00:00Z" },
    },
  };
  assert.equal(isCliUsageFresh("claude", usage, 5 * 60_000, NOW), true);
  assert.equal(isCliUsageFresh("codex", usage, 5 * 60_000, NOW), false);
});
