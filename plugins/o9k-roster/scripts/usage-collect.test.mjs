import { test } from "node:test";
import assert from "node:assert/strict";
import { isSubscriptionCli } from "./usage-collect.mjs";

test("isSubscriptionCli rejects non-subscription clis like hermes", () => {
  const roster = { subscriptions: ["claude", "codex", "cursor"] };
  assert.equal(isSubscriptionCli("hermes", roster), false);
  assert.equal(isSubscriptionCli("codex", roster), true);
});
