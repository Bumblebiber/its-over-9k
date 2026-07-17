import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseResetAt,
  windowIsBlocking,
  modelUsageGate,
  isCliUsageFresh,
  effectiveResetAt,
  WINDOW_MAX_AGE_MS,
  windowAppliesToCli,
} from "./usage-windows.mjs";

const NOW = Date.parse("2026-07-17T12:00:00Z");

test("windowAppliesToCli matches window prefix to host cli", () => {
  assert.equal(windowAppliesToCli("claude:session", "claude"), true);
  assert.equal(windowAppliesToCli("codex:weekly", "claude"), false);
  assert.equal(windowAppliesToCli("codex:weekly", null), true);
});

test("parseResetAt parses ISO and codex-style reset strings in UTC", () => {
  assert.equal(parseResetAt("2026-07-23T17:26:00Z", NOW), Date.parse("2026-07-23T17:26:00Z"));
  const codex = parseResetAt("17:26 on 23 Jul", NOW);
  assert.equal(codex, Date.UTC(2026, 6, 23, 17, 26, 0));
  assert.ok(codex > NOW);
});

test("parseResetAt rolls codex date to next year when month/day already passed", () => {
  const winter = Date.parse("2026-12-15T12:00:00Z");
  const codex = parseResetAt("17:26 on 23 Jul", winter);
  assert.equal(codex, Date.UTC(2027, 6, 23, 17, 26, 0));
});

test("windowIsBlocking ignores windows past resets_at", () => {
  const usage = {
    windows: {
      "codex:weekly": { used: 1.0, resets_at: "2026-07-16T10:00:00Z" },
    },
  };
  assert.equal(windowIsBlocking("codex:weekly", usage, 0.95, NOW), false);
});

test("windowIsBlocking expires hot windows without resets_at after max age from updated", () => {
  const updated = new Date(NOW - WINDOW_MAX_AGE_MS["codex:weekly"] - 60_000).toISOString();
  const usage = {
    windows: {
      "codex:weekly": { used: 1.0, updated },
    },
  };
  assert.equal(windowIsBlocking("codex:weekly", usage, 0.95, NOW), false);
});

test("windowIsBlocking keeps sub-threshold windows without resets_at", () => {
  const usage = {
    windows: {
      "codex:weekly": { used: 0.5, updated: "2020-01-01T00:00:00Z" },
    },
  };
  assert.equal(windowIsBlocking("codex:weekly", usage, 0.95, NOW), false);
});

test("effectiveResetAt uses updated+maxAge only for hot windows", () => {
  const hot = { used: 1.0, updated: "2026-07-17T10:00:00Z" };
  const cool = { used: 0.5, updated: "2026-07-17T10:00:00Z" };
  assert.ok(effectiveResetAt(hot, "codex:weekly", 0.95, NOW) > NOW);
  assert.equal(effectiveResetAt(cool, "codex:weekly", 0.95, NOW), null);
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
