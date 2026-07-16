import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_WRAPPERS = [
  { name: "o9k-core-session", target: "core/session-start", timeout: 15 },
  { name: "o9k-memory-session", target: "memory/session-start", timeout: 15 },
  { name: "o9k-update-check", target: "core/update-check", timeout: 20 },
  { name: "o9k-memory-precompact", target: "memory/pre-compact", timeout: 30 },
];

const PRE_LLM_WIRE = HOOK_WRAPPERS.filter((w) => w.name !== "o9k-memory-precompact");

const PRECOMPACT_DETAIL =
  "precompact: unsupported (Hermes has no pre-compact hook; session hooks use pre_llm_call; precompact wrapper installed only)";

function expandHome(home, value) {
  return value.replace(/^~(?=\/)/, home);
}

function hookCommandPath(home, script) {
  return expandHome(home, `~/.hermes/agent-hooks/${script}.sh`);
}

function isO9kHookLine(line) {
  if (!/command:/.test(line)) return false;
  if (/agent-hooks\/o9k-/.test(line)) return true;
  return HOOK_WRAPPERS.some((w) => line.includes(`/${w.name}`));
}

function formatHookEntry(home, { name, timeout }) {
  const cmd = hookCommandPath(home, name);
  return [`    - command: ${cmd}`, `      timeout: ${timeout}`];
}

function stripO9kListItems(lines, eventIndent = "  ") {
  const eventRe = new RegExp(`^${eventIndent}[a-z_]+:\\s*$`);
  const itemRe = new RegExp(`^${eventIndent}  - `);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (eventRe.test(line)) {
      out.push(line);
      i += 1;
      while (i < lines.length) {
        const cur = lines[i];
        if (eventRe.test(cur) || (/^[^ ]/.test(cur) && !itemRe.test(cur))) break;
        if (itemRe.test(cur)) {
          const itemLines = [cur];
          i += 1;
          while (i < lines.length) {
            const next = lines[i];
            if (itemRe.test(next)) break;
            if (/^  [a-z_]+:/.test(next)) break;
            if (/^[^ ]/.test(next)) break;
            if (/^      /.test(next)) {
              itemLines.push(next);
              i += 1;
              continue;
            }
            break;
          }
          if (!itemLines.some(isO9kHookLine)) out.push(...itemLines);
          continue;
        }
        out.push(cur);
        i += 1;
      }
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out;
}

function findHooksBounds(lines) {
  const start = lines.findIndex((l) => /^hooks:\s*$/.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[a-z_][a-z0-9_]*:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function findEventInSection(sectionLines, eventName) {
  const marker = `  ${eventName}:`;
  const start = sectionLines.findIndex((l) => l === marker || l.startsWith(`${marker} `));
  if (start === -1) return null;
  let end = sectionLines.length;
  for (let i = start + 1; i < sectionLines.length; i++) {
    if (/^  [a-z_]+:/.test(sectionLines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function appendEventBlock(sectionLines, eventName, entries) {
  const found = findEventInSection(sectionLines, eventName);
  if (!found) {
    return [...sectionLines, `  ${eventName}:`, ...entries.flatMap((e) => e)];
  }
  const before = sectionLines.slice(0, found.end);
  const after = sectionLines.slice(found.end);
  return [...before, ...entries.flatMap((e) => e), ...after];
}

function buildHooksSection(home) {
  const entries = PRE_LLM_WIRE.map((w) => formatHookEntry(home, w));
  let section = ["hooks:", "  pre_llm_call:"];
  for (const entry of entries) section.push(...entry);
  return section;
}

/**
 * Line-oriented idempotent merge for Hermes ~/.hermes/config.yaml hooks: block.
 */
export function mergeHermesHooksYaml(existingYaml, { home }) {
  const normalized = existingYaml.endsWith("\n") ? existingYaml : `${existingYaml}\n`;
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  const bounds = findHooksBounds(lines);
  const entries = PRE_LLM_WIRE.map((w) => formatHookEntry(home, w));

  if (!bounds) {
    const block = buildHooksSection(home);
    const trimmed = lines.filter((l, i) => !(i === lines.length - 1 && l === ""));
    return `${[...trimmed, "", ...block].join("\n")}\n`;
  }

  const before = lines.slice(0, bounds.start);
  let section = lines.slice(bounds.start, bounds.end);
  section = stripO9kListItems(section);
  section = appendEventBlock(section, "pre_llm_call", entries);

  const after = lines.slice(bounds.end);
  return `${[...before, ...section, ...after].join("\n")}\n`;
}

function buildWrapperScript({ marketplaceRoot, runHookPath, target }) {
  const root = marketplaceRoot.replace(/"/g, '\\"');
  const runner = runHookPath.replace(/"/g, '\\"');
  return `#!/usr/bin/env bash
export O9K_MARKETPLACE_ROOT="${root}"
exec bash "${runner}" ${target}
`;
}

function wrapperContentMatches(filePath, expected) {
  try {
    return fs.readFileSync(filePath, "utf8") === expected;
  } catch {
    return false;
  }
}

function installWrapper({ hooksDir, name, content, dryRun }) {
  const dest = path.join(hooksDir, `${name}.sh`);
  if (wrapperContentMatches(dest, content)) return false;

  if (dryRun) return true;

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(dest, content, { mode: 0o755 });
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    // best-effort on platforms that ignore mode in writeFileSync
  }
  return true;
}

/**
 * Wire o9k hooks into Hermes ~/.hermes/config.yaml and agent-hooks wrappers.
 */
export function wireHermes({ home, marketplaceRoot, dryRun = false }) {
  const hooksDir = path.join(home, ".hermes/agent-hooks");
  const configPath = path.join(home, ".hermes/config.yaml");
  const pluginRoot = fileURLToPath(new URL("../..", import.meta.url));
  const resolvedMarketplace = marketplaceRoot ?? path.join(pluginRoot, "..");
  const runHookPath = path.join(resolvedMarketplace, "o9k-core/hooks/adapters/run-o9k-hook.sh");

  if (!fs.existsSync(runHookPath)) {
    return { ok: false, detail: `missing run-o9k-hook.sh: ${runHookPath}` };
  }

  const installed = [];
  for (const { name, target } of HOOK_WRAPPERS) {
    const content = buildWrapperScript({
      marketplaceRoot: resolvedMarketplace,
      runHookPath,
      target,
    });
    if (installWrapper({ hooksDir, name, content, dryRun })) installed.push(name);
  }

  let existingYaml = "";
  try {
    existingYaml = fs.readFileSync(configPath, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  const merged = mergeHermesHooksYaml(existingYaml, { home });

  if (!dryRun) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, merged);
  }

  const parts = [];
  if (dryRun) parts.push("dry-run: no files written");
  if (installed.length) parts.push(`installed wrappers: ${installed.join(", ")}`);
  parts.push(`merged ${configPath}`);
  parts.push("session hooks → pre_llm_call");
  parts.push(PRECOMPACT_DETAIL);

  return { ok: true, detail: parts.join("; ") };
}
