import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  shouldStamp,
  extractFilePath,
  formatProvenanceBlock,
  prependProvenance,
  stampMarkdownFile,
  handleHookPayload,
  writeIntent,
  PROVENANCE_MARKER,
} from "./md-provenance.mjs";

test("shouldStamp allows normal markdown", () => {
  assert.equal(shouldStamp("/tmp/notes/PLAN.md"), true);
  assert.equal(shouldStamp("/home/x/projects/o9k/README.md"), true);
});

test("shouldStamp denies skill/host docs and caches", () => {
  assert.equal(shouldStamp("/tmp/foo/SKILL.md"), false);
  assert.equal(shouldStamp("/tmp/AGENTS.md"), false);
  assert.equal(shouldStamp("/tmp/CLAUDE.md"), false);
  assert.equal(shouldStamp("/tmp/node_modules/pkg/README.md"), false);
  assert.equal(
    shouldStamp("/home/x/.claude/plugins/cache/o9k/o9k-core/0.1.0/skills/x/SKILL.md"),
    false,
  );
  assert.equal(shouldStamp("/tmp/foo.ts"), false);
});

test("extractFilePath reads Claude and Cursor shapes", () => {
  assert.equal(
    extractFilePath({ tool_input: { file_path: "/a/b.md" } }),
    path.resolve("/a/b.md"),
  );
  assert.equal(extractFilePath({ file_path: "/c/d.md" }), path.resolve("/c/d.md"));
  assert.equal(extractFilePath({ path: "/e/f.md" }), path.resolve("/e/f.md"));
  assert.equal(extractFilePath({}), null);
});

test("formatProvenanceBlock + prepend append-log newest first", () => {
  const b1 = formatProvenanceBlock({
    who: "cursor:grok",
    when: "2026-07-25T10:00:00.000Z",
    why: "first",
    trigger: "Write",
    host: "cursor",
  });
  const b2 = formatProvenanceBlock({
    who: "claude:opus",
    when: "2026-07-25T11:00:00.000Z",
    why: "second",
    trigger: "Edit",
    host: "claude",
  });
  assert.match(b1, new RegExp(`<!-- ${PROVENANCE_MARKER}`));
  const once = prependProvenance("# Title\n", b1);
  const twice = prependProvenance(once, b2);
  assert.ok(twice.indexOf("second") < twice.indexOf("first"));
  assert.ok(twice.indexOf("first") < twice.indexOf("# Title"));
});

test("stampMarkdownFile writes and respects deny", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-prov-"));
  const md = path.join(dir, "NOTE.md");
  const skill = path.join(dir, "SKILL.md");
  fs.writeFileSync(md, "# hi\n");
  fs.writeFileSync(skill, "# skill\n");

  const r1 = stampMarkdownFile(md, {
    who: "test",
    when: "2026-07-25T12:00:00.000Z",
    why: "unit",
    trigger: "test",
    host: "test",
  });
  assert.equal(r1.stamped, true);
  const body = fs.readFileSync(md, "utf8");
  assert.match(body, /o9k-provenance/);
  assert.match(body, /why: unit/);
  assert.match(body, /# hi/);

  const r2 = stampMarkdownFile(skill, {
    who: "test",
    when: "2026-07-25T12:00:00.000Z",
    why: "nope",
    trigger: "test",
    host: "test",
  });
  assert.equal(r2.stamped, false);
  assert.equal(fs.readFileSync(skill, "utf8"), "# skill\n");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("handleHookPayload uses matching intent then clears it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-prov-"));
  const md = path.join(dir, "HANDOFF.md");
  const intentFile = path.join(dir, "intent.json");
  fs.writeFileSync(md, "body\n");
  writeIntent(
    { path: md, why: "pass-to opus", trigger: "/o9k-pass-to opus", who: "cursor:test" },
    intentFile,
  );

  const r = handleHookPayload(
    { tool_name: "Write", tool_input: { file_path: md } },
    { intentFile, env: { O9K_HOST: "cursor" } },
  );
  assert.equal(r.stamped, true);
  const body = fs.readFileSync(md, "utf8");
  assert.match(body, /why: pass-to opus/);
  assert.match(body, /trigger: \/o9k-pass-to opus/);
  assert.equal(fs.existsSync(intentFile), false);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("handleHookPayload without intent still stamps unspecified", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-prov-"));
  const md = path.join(dir, "x.md");
  fs.writeFileSync(md, "x\n");
  const r = handleHookPayload(
    { tool_name: "Edit", tool_input: { file_path: md } },
    { intentFile: path.join(dir, "missing.json"), env: { O9K_HOST: "claude" } },
  );
  assert.equal(r.stamped, true);
  assert.match(fs.readFileSync(md, "utf8"), /why: unspecified/);
  fs.rmSync(dir, { recursive: true, force: true });
});
