import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLimitWatchCli } from "./limit-watch-host.mjs";

test("detectLimitWatchCli honors O9K_LIMIT_WATCH_CLI", () => {
  assert.equal(detectLimitWatchCli({ O9K_LIMIT_WATCH_CLI: "codex" }), "codex");
});

test("detectLimitWatchCli infers cursor from CURSOR_AGENT", () => {
  assert.equal(detectLimitWatchCli({ CURSOR_AGENT: "1" }), "cursor");
});

test("detectLimitWatchCli defaults to claude", () => {
  assert.equal(detectLimitWatchCli({}), "claude");
});
