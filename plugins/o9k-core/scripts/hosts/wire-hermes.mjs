import fs from "node:fs";
import path from "node:path";
import {
  HOOK_WRAPPERS,
  buildWrapperScript,
  installWrapper,
  resolveRoots,
  writeFileWithBackup,
} from "./common.mjs";

const PRE_LLM_WIRE = HOOK_WRAPPERS.filter((w) => w.name !== "o9k-memory-precompact");

// o9k-update-check already throttles itself via its own on-disk cache
// (see update-check.mjs), so it doesn't need the once-per-session marker
// guard below — only the two session-start scripts do.
const GUARDED_NAMES = new Set(["o9k-core-session", "o9k-memory-session"]);

const PRECOMPACT_DETAIL =
  "precompact: unsupported (Hermes has no pre-compact hook; session hooks use pre_llm_call; precompact wrapper installed only)";

const HOOKS_LINE_RE = /^hooks:(.*)$/;
const HOOKS_EMPTY_INLINE_RE = /^(\{\}|null|~)?$/;

function stripComment(s) {
  return s.replace(/#.*/, "").trim();
}

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

/**
 * Classify the `hooks:` line, if any: "empty" (bare `hooks:`, `hooks: {}`,
 * `hooks: null`, `hooks: ~`, all optionally with a trailing comment) is safe
 * to treat as a block-style section start; "flow" (any other non-empty
 * inline value, e.g. `hooks: {a: b}`) is a YAML flow mapping we must not
 * touch — appending a second `hooks:` key would corrupt the file.
 */
function classifyHooksLine(lines) {
  const idx = lines.findIndex((l) => HOOKS_LINE_RE.test(l));
  if (idx === -1) return { kind: "missing", idx: -1 };
  const rest = stripComment(lines[idx].match(HOOKS_LINE_RE)[1]);
  if (HOOKS_EMPTY_INLINE_RE.test(rest)) return { kind: "empty", idx };
  return { kind: "flow", idx };
}

/** True when existingYaml's `hooks:` key uses non-empty inline flow style. */
export function hasInlineFlowHooks(existingYaml) {
  return classifyHooksLine(existingYaml.split("\n")).kind === "flow";
}

function findHooksBounds(lines) {
  const { kind, idx } = classifyHooksLine(lines);
  if (kind !== "empty") return null;
  const start = idx;
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
 * Returns `existingYaml` unchanged (see hasInlineFlowHooks) when `hooks:` is
 * a non-empty inline flow mapping — merging into that would require a real
 * YAML parser and duplicating the key is worse than doing nothing.
 */
export function mergeHermesHooksYaml(existingYaml, { home }) {
  if (hasInlineFlowHooks(existingYaml)) return existingYaml;

  const normalized = existingYaml.endsWith("\n") ? existingYaml : `${existingYaml}\n`;
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  // Normalize an inline-empty `hooks: {}` / `hooks: null` / `hooks: ~` line
  // to a bare `hooks:` before locating bounds, so the block insertion below
  // has a clean block-style key to hang the pre_llm_call list off of.
  const { kind, idx } = classifyHooksLine(lines);
  if (kind === "empty") lines[idx] = "hooks:";

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

/**
 * Strip-only counterpart of mergeHermesHooksYaml — removes o9k list items
 * from the hooks: block without re-adding anything (used by o9k-uninstall).
 * Returns the input unchanged when there is nothing to strip or the hooks:
 * key uses inline flow style.
 */
export function stripHermesO9kHooksYaml(existingYaml) {
  if (!existingYaml || hasInlineFlowHooks(existingYaml)) return existingYaml;

  const normalized = existingYaml.endsWith("\n") ? existingYaml : `${existingYaml}\n`;
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  const bounds = findHooksBounds(lines);
  if (!bounds) return existingYaml;

  const before = lines.slice(0, bounds.start);
  const section = stripO9kListItems(lines.slice(bounds.start, bounds.end));
  const after = lines.slice(bounds.end);
  return `${[...before, ...section, ...after].join("\n")}\n`;
}

/**
 * Wire o9k hooks into Hermes ~/.hermes/config.yaml and agent-hooks wrappers.
 */
export function wireHermes({ home, marketplaceRoot, dryRun = false }) {
  const hooksDir = path.join(home, ".hermes/agent-hooks");
  const configPath = path.join(home, ".hermes/config.yaml");
  const { marketplaceRoot: resolvedMarketplace } = resolveRoots(import.meta.url, marketplaceRoot);
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
      guardName: GUARDED_NAMES.has(name) ? name : undefined,
    });
    if (installWrapper({ hooksDir, name, content, dryRun })) installed.push(name);
  }

  let existingYaml = "";
  try {
    existingYaml = fs.readFileSync(configPath, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  const flowWarning = hasInlineFlowHooks(existingYaml)
    ? "hooks: uses inline flow style — merge skipped, wire manually"
    : null;
  const merged = mergeHermesHooksYaml(existingYaml, { home });

  if (!dryRun) {
    writeFileWithBackup(configPath, merged);
  }

  const parts = [];
  if (dryRun) parts.push("dry-run: no files written");
  if (installed.length) parts.push(`installed wrappers: ${installed.join(", ")}`);
  parts.push(`merged ${configPath}`);
  parts.push("session hooks → pre_llm_call");
  parts.push(PRECOMPACT_DETAIL);
  if (flowWarning) parts.push(`warning: ${flowWarning}`);

  return { ok: true, detail: parts.join("; "), warning: flowWarning };
}
