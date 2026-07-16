import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeHermesHooksYaml, wireHermes } from "./wire-hermes.mjs";

const coreRoot = fileURLToPath(new URL("../..", import.meta.url));
const marketRoot = path.join(coreRoot, "..");

const FIXTURE_YAML = `model:
  default: test-model
hooks:
  pre_llm_call:
    - command: ~/.hermes/agent-hooks/foreign.sh
  on_session_end:
    - command: ~/.hermes/agent-hooks/foreign-end.sh
security:
  redact_secrets: true
`;

function makeTmpHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-wire-hermes-"));
  fs.mkdirSync(path.join(tmp, ".hermes"), { recursive: true });
  return tmp;
}

function hookCommands(yaml, event) {
  const lines = yaml.split("\n");
  const re = new RegExp(`^  ${event}:`);
  const start = lines.findIndex((l) => re.test(l));
  assert.notEqual(start, -1, `missing ${event}`);
  const cmds = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^  [a-z_]+:/.test(line)) break;
    if (/^[^ ]/.test(line)) break;
    const m = line.match(/command:\s*(.+)/);
    if (m) cmds.push(m[1].trim());
  }
  return cmds;
}

test("mergeHermesHooksYaml preserves foreign hooks and adds o9k entries", () => {
  const home = "/tmp/hermes-home";
  const merged = mergeHermesHooksYaml(FIXTURE_YAML, { home });
  const pre = hookCommands(merged, "pre_llm_call");
  assert.ok(pre.some((c) => c.includes("foreign.sh")));
  assert.ok(pre.some((c) => c.includes("o9k-core-session")));
  assert.ok(pre.some((c) => c.includes("o9k-memory-session")));
  assert.ok(pre.some((c) => c.includes("o9k-update-check")));
  assert.equal(pre.filter((c) => c.includes("o9k-")).length, 3);

  const end = hookCommands(merged, "on_session_end");
  assert.ok(end.some((c) => c.includes("foreign-end.sh")));
  assert.equal(end.filter((c) => c.includes("o9k-")).length, 0);
  assert.match(merged, /security:\n  redact_secrets: true/);
});

test("mergeHermesHooksYaml appends hooks block when missing", () => {
  const base = "model:\n  default: solo\n";
  const merged = mergeHermesHooksYaml(base, { home: "/tmp/x" });
  assert.match(merged, /^hooks:/m);
  const pre = hookCommands(merged, "pre_llm_call");
  assert.ok(pre.some((c) => c.includes("o9k-core-session")));
});

test("mergeHermesHooksYaml is idempotent", () => {
  const once = mergeHermesHooksYaml(FIXTURE_YAML, { home: "/tmp/x" });
  const twice = mergeHermesHooksYaml(once, { home: "/tmp/x" });
  assert.equal(twice, once);
});

test("wireHermes merges config and installs wrappers", () => {
  const home = makeTmpHome();
  const configPath = path.join(home, ".hermes/config.yaml");
  fs.writeFileSync(configPath, FIXTURE_YAML);

  const r = wireHermes({ home, marketplaceRoot: marketRoot });
  assert.equal(r.ok, true);
  assert.match(r.detail, /precompact: unsupported/);

  const merged = fs.readFileSync(configPath, "utf8");
  const pre = hookCommands(merged, "pre_llm_call");
  assert.ok(pre.some((c) => c.includes("foreign.sh")));
  assert.ok(pre.some((c) => c.includes("o9k-core-session")));

  const wrapper = path.join(home, ".hermes/agent-hooks/o9k-core-session.sh");
  assert.ok(fs.existsSync(wrapper));
  const body = fs.readFileSync(wrapper, "utf8");
  assert.match(body, /O9K_MARKETPLACE_ROOT=".*\/plugins"/);
  assert.match(body, /core\/session-start/);

  const precompactWrapper = path.join(home, ".hermes/agent-hooks/o9k-memory-precompact.sh");
  assert.ok(fs.existsSync(precompactWrapper));

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermes is idempotent", () => {
  const home = makeTmpHome();
  fs.writeFileSync(path.join(home, ".hermes/config.yaml"), FIXTURE_YAML);
  const once = wireHermes({ home, marketplaceRoot: marketRoot });
  const yamlOnce = fs.readFileSync(path.join(home, ".hermes/config.yaml"), "utf8");
  const twice = wireHermes({ home, marketplaceRoot: marketRoot });
  const yamlTwice = fs.readFileSync(path.join(home, ".hermes/config.yaml"), "utf8");
  assert.equal(once.ok, true);
  assert.equal(twice.ok, true);
  assert.equal(yamlTwice, yamlOnce);
  fs.rmSync(home, { recursive: true, force: true });
});

test("mergeHermesHooksYaml preserves foreign-o9k-helper (o9k- substring, not o9k hook)", () => {
  const yaml = `hooks:
  pre_llm_call:
    - command: ~/.hermes/agent-hooks/foreign-o9k-helper.sh
`;
  const merged = mergeHermesHooksYaml(yaml, { home: "/tmp/x" });
  const pre = hookCommands(merged, "pre_llm_call");
  assert.ok(pre.some((c) => c.includes("foreign-o9k-helper.sh")));
  assert.equal(pre.filter((c) => c.includes("foreign-o9k-helper")).length, 1);
});

test("wireHermes preserves foreign-o9k-helper.sh", () => {
  const home = makeTmpHome();
  const configPath = path.join(home, ".hermes/config.yaml");
  const yaml = `hooks:
  pre_llm_call:
    - command: ~/.hermes/agent-hooks/foreign-o9k-helper.sh
`;
  fs.writeFileSync(configPath, yaml);

  const r = wireHermes({ home, marketplaceRoot: marketRoot });
  assert.equal(r.ok, true);

  const merged = fs.readFileSync(configPath, "utf8");
  const pre = hookCommands(merged, "pre_llm_call");
  assert.ok(pre.some((c) => c.includes("foreign-o9k-helper.sh")));
  assert.ok(pre.some((c) => c.includes("o9k-core-session")));

  fs.rmSync(home, { recursive: true, force: true });
});

test("wireHermes dryRun does not write files", () => {
  const home = makeTmpHome();
  const configPath = path.join(home, ".hermes/config.yaml");
  fs.writeFileSync(configPath, FIXTURE_YAML);

  const r = wireHermes({ home, marketplaceRoot: marketRoot, dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(configPath, "utf8"), FIXTURE_YAML);
  assert.equal(fs.existsSync(path.join(home, ".hermes/agent-hooks/o9k-core-session.sh")), false);
  fs.rmSync(home, { recursive: true, force: true });
});
