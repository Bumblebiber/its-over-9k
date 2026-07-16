import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyInventory,
  collectInventory,
  mcpNamesFromFile,
  registryDetectIndex,
} from "./detect.mjs";

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "o9k-inv-"));
}

test("registryDetectIndex includes pillar ids and rival detect fragments", () => {
  const idx = registryDetectIndex();
  assert.ok(idx.plugins.has("o9k-core"));
  assert.ok(idx.plugins.has("claude-mem") || idx.mcps.has("claude-mem"));
  assert.ok(idx.mcps.has("context7") || idx.plugins.size > 0);
});

test("mcpNamesFromFile reads mcpServers from JSON", () => {
  const tmp = tmpHome();
  const f = path.join(tmp, "mcp.json");
  fs.writeFileSync(
    f,
    JSON.stringify({ mcpServers: { "mystery-mem": {}, context7: {} } })
  );
  const names = mcpNamesFromFile(f);
  assert.deepEqual(names.sort(), ["context7", "mystery-mem"]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("mcpNamesFromFile reads [mcp_servers.X] from TOML", () => {
  const tmp = tmpHome();
  const f = path.join(tmp, "config.toml");
  fs.writeFileSync(
    f,
    "[mcp_servers.serena]\ncommand = \"x\"\n\n[mcp_servers.weird-tool]\ncommand = \"y\"\n"
  );
  const names = mcpNamesFromFile(f).sort();
  assert.deepEqual(names, ["serena", "weird-tool"]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("classifyInventory marks registry plugins known and strangers unknown", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "settings.json"),
    JSON.stringify({
      enabledPlugins: {
        "o9k-core@o9k": true,
        "superpowers@claude-plugins-official": true,
        "totally-unknown-plugin@somewhere": true,
      },
    })
  );
  fs.writeFileSync(
    path.join(home, ".claude.json"),
    JSON.stringify({
      mcpServers: {
        context7: { command: "npx" },
        "alien-memory": { command: "uvx" },
      },
    })
  );
  fs.mkdirSync(path.join(home, ".agents", "skills", "o9k"), { recursive: true });
  fs.mkdirSync(path.join(home, ".agents", "skills", "mystery-skill"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(home, ".agents", "skills", "o9k", "caveman"), {
    recursive: true,
  });

  const { known, unknown, unknownCount } = classifyInventory({ home, pathEnv: "" });

  assert.ok(known.plugins.some((k) => k.startsWith("o9k-core@")));
  assert.ok(known.plugins.some((k) => k.startsWith("superpowers@")));
  assert.ok(unknown.plugins.some((k) => k.startsWith("totally-unknown-plugin@")));

  assert.ok(known.mcps.some((m) => m.name === "context7"));
  assert.ok(unknown.mcps.some((m) => m.name === "alien-memory"));

  assert.ok(known.skills.some((s) => s.name === "o9k" || s.name.startsWith("o9k/")));
  assert.ok(unknown.skills.some((s) => s.name === "mystery-skill"));
  assert.ok(unknownCount >= 3);

  fs.rmSync(home, { recursive: true, force: true });
});

test("collectInventory includes Cursor mcp.json when host home exists", () => {
  const home = tmpHome();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "o9k-bin-"));
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  fs.writeFileSync(path.join(binDir, "cursor-agent"), "#!/bin/sh\n", {
    mode: 0o755,
  });
  fs.writeFileSync(
    path.join(home, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { "cursor-only-mcp": {} } })
  );
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: {} }));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "settings.json"),
    JSON.stringify({ enabledPlugins: {} })
  );

  const inv = collectInventory({ home, pathEnv: binDir });
  assert.ok(inv.mcps.some((m) => m.name === "cursor-only-mcp" && m.host === "cursor"));

  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(binDir, { recursive: true, force: true });
});
