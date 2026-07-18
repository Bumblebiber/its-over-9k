import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePayload } from "./normalize.mjs";

test("empty / invalid → canonical defaults", () => {
  const c = normalizePayload(null, { host: "unknown" });
  assert.equal(c.host, "unknown");
  assert.equal(c.width, 80);
  assert.equal(c.model, null);
  assert.equal(c.context, null);
});

test("claude-shaped payload", () => {
  const c = normalizePayload(
    {
      cwd: "/proj",
      render_width_chars: 100,
      model: { id: "x", display_name: "Opus" },
      context_window: { used_percentage: 40, remaining_percentage: 60 },
      worktree: { name: "feat", path: "/wt" },
    },
    { host: "claude" },
  );
  assert.equal(c.width, 100);
  assert.equal(c.model.display_name, "Opus");
  assert.equal(c.context.used_percentage, 40);
  assert.equal(c.worktree.name, "feat");
  assert.equal(c.cwd, "/proj");
});

test("cursor payload uses same fields when present", () => {
  const c = normalizePayload(
    {
      cwd: "/c",
      render_width_chars: 90,
      model: { display_name: "Grok" },
    },
    { host: "cursor" },
  );
  assert.equal(c.host, "cursor");
  assert.equal(c.width, 90);
  assert.equal(c.model.display_name, "Grok");
});
