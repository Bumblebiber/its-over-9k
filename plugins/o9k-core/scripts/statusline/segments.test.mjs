import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "./segments/index.mjs";

test("model placeholder when missing", () => {
  assert.equal(renderSegment("model", { model: null }), "mdl:—");
});

test("model shows display_name", () => {
  assert.equal(renderSegment("model", { model: { display_name: "Opus" } }), "Opus");
});

test("context placeholder", () => {
  assert.equal(renderSegment("context", { context: null }), "ctx:—");
});

test("context percent", () => {
  assert.equal(
    renderSegment("context", { context: { used_percentage: 34.5 } }),
    "ctx:35%",
  );
});

test("limits placeholder when no usage file", () => {
  assert.equal(
    renderSegment("limits", { host: "claude" }, { usagePath: "/no/such/usage.json" }),
    "lim:—",
  );
});

test("tim placeholder when runner returns null", () => {
  assert.equal(
    renderSegment("tim", { cwd: "/x" }, { runTim: () => null }),
    "tim:—",
  );
});
