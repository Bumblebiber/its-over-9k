import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wireCodexStatusline } from "./wire-codex.mjs";
import { wireOpencodeStatusline } from "./wire-opencode.mjs";
import { parseHostsArg, wireAllStatusline } from "./wire-all.mjs";

const marketplaceRoot = path.join(fileURLToPath(new URL("../../..", import.meta.url)));

test("wireCodexStatusline is unsupported", () => {
  const r = wireCodexStatusline({ home: "/tmp", marketplaceRoot: "/tmp" });
  assert.equal(r.ok, false);
  assert.equal(r.unsupported, true);
  assert.equal(r.detail, "codex has no statusLine API in v1");
});

test("wireOpencodeStatusline is unsupported", () => {
  const r = wireOpencodeStatusline({ home: "/tmp", marketplaceRoot: "/tmp" });
  assert.equal(r.ok, false);
  assert.equal(r.unsupported, true);
  assert.equal(r.detail, "opencode has no statusLine API in v1");
});

test("parseHostsArg splits host:mode pairs", () => {
  assert.deepEqual(parseHostsArg("claude:replace,cursor:keep"), {
    claude: "replace",
    cursor: "keep",
  });
});

test("wireAllStatusline cursor replace ok; codex unsupported", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-all-"));
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });

  const r = wireAllStatusline({
    home,
    marketplaceRoot,
    hosts: { cursor: "replace", codex: "replace" },
  });

  assert.equal(r.results.length, 2);

  const cursor = r.results.find((x) => x.id === "cursor");
  assert.equal(cursor.ok, true);
  assert.match(cursor.detail, /wired/);
  const j = JSON.parse(fs.readFileSync(path.join(home, ".cursor/cli-config.json"), "utf8"));
  assert.match(j.statusLine.command, /o9k-statusline/);

  const codex = r.results.find((x) => x.id === "codex");
  assert.equal(codex.ok, false);
  assert.equal(codex.unsupported, true);

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireAllStatusline mode skip returns skipped", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-all-skip-"));

  const r = wireAllStatusline({
    home,
    marketplaceRoot,
    hosts: { claude: "skip", hermes: "skip" },
  });

  assert.equal(r.results.length, 2);
  for (const entry of r.results) {
    assert.equal(entry.ok, true);
    assert.equal(entry.skipped, true);
    assert.equal(entry.detail, "skipped");
  }

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireAllStatusline unknown host reports error", () => {
  const r = wireAllStatusline({
    home: os.tmpdir(),
    marketplaceRoot,
    hosts: { unknownhost: "replace" },
  });

  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].ok, false);
  assert.match(r.results[0].detail, /unknown host/);
});
