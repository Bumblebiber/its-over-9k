// md-provenance.mjs — stamp .md files with append-log provenance comments.
// Hook entry (Claude PostToolUse / Cursor afterFileEdit): reads JSON stdin,
// prepends <!-- o9k-provenance ... --> when path is eligible.
// Fail-open: never exit non-zero on stamp failures.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PROVENANCE_MARKER = "o9k-provenance";
export const INTENT_BASENAME = "md-provenance-intent.json";

const DENY_BASENAMES = new Set([
  "skill.md",
  "agents.md",
  "claude.md",
  "codex.md",
  "gemini.md",
]);

const DENY_PATH_PARTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.git${path.sep}`,
  `${path.sep}.claude${path.sep}plugins${path.sep}cache${path.sep}`,
  `${path.sep}.codex${path.sep}vendor${path.sep}`,
  `${path.sep}.cursor${path.sep}skills-cursor${path.sep}`,
  `${path.sep}skills-cursor${path.sep}`,
];

export function intentPath(home = os.homedir()) {
  return process.env.O9K_MD_PROVENANCE_INTENT || path.join(home, ".o9k", INTENT_BASENAME);
}

/** True when this path should receive a provenance stamp. */
export function shouldStamp(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  const abs = path.resolve(filePath);
  if (!abs.toLowerCase().endsWith(".md")) return false;
  const base = path.basename(abs).toLowerCase();
  if (DENY_BASENAMES.has(base)) return false;
  const norm = abs.split(path.sep).join(path.sep);
  for (const part of DENY_PATH_PARTS) {
    if (norm.includes(part)) return false;
  }
  // Also deny .../skills/<anything>/SKILL.md already covered; deny .mdc as non-.md
  return true;
}

/**
 * Pull a file path from Claude / Cursor / generic hook payloads.
 */
export function extractFilePath(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.tool_input?.file_path,
    payload.tool_input?.path,
    payload.file_path,
    payload.filePath,
    payload.path,
    payload.uri,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return path.resolve(c.trim());
  }
  return null;
}

export function detectHost(payload = {}, env = process.env) {
  if (env.O9K_HOST) return String(env.O9K_HOST);
  if (env.CLAUDE_PLUGIN_ROOT || env.CLAUDE_PROJECT_DIR || payload.hook_event_name) {
    if (String(payload.hook_event_name || "").toLowerCase().includes("file") || env.CURSOR_TRACE_ID) {
      /* fall through */
    }
  }
  if (env.CURSOR_TRACE_ID || env.CURSOR_AGENT || payload.conversation_id) return "cursor";
  if (env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDECODE || env.CLAUDE_PLUGIN_ROOT) return "claude";
  if (env.CODEX_HOME) return "codex";
  if (payload.hook_event_name === "PostToolUse" || payload.tool_name) return "claude";
  if (payload.file_path && !payload.tool_name) return "cursor";
  return "unknown";
}

export function detectWho(payload = {}, env = process.env) {
  if (env.O9K_WHO) return String(env.O9K_WHO);
  const host = detectHost(payload, env);
  const model =
    env.O9K_MODEL ||
    env.CURSOR_MODEL ||
    env.ANTHROPIC_MODEL ||
    payload.model ||
    null;
  if (model) return `${host}:${model}`;
  return host;
}

export function formatProvenanceBlock({
  who,
  when,
  why,
  trigger,
  host,
}) {
  const lines = [
    `<!-- ${PROVENANCE_MARKER}`,
    `who: ${sanitizeField(who) || "unknown"}`,
    `when: ${sanitizeField(when) || new Date().toISOString()}`,
    `why: ${sanitizeField(why) || "unspecified"}`,
    `trigger: ${sanitizeField(trigger) || "unspecified"}`,
    `host: ${sanitizeField(host) || "unknown"}`,
    `-->`,
  ];
  return lines.join("\n") + "\n";
}

function sanitizeField(v) {
  if (v == null) return "";
  return String(v).replace(/\r?\n/g, " ").trim().slice(0, 500);
}

/** Prepend a new provenance block (append-log: newest first). */
export function prependProvenance(content, block) {
  const text = content ?? "";
  const b = block.endsWith("\n") ? block : `${block}\n`;
  if (text.startsWith(b)) return text; // identical consecutive stamp — no-op
  return b + text;
}

export function loadIntent(file = intentPath()) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}

export function clearIntent(file = intentPath()) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}

export function writeIntent(intent, file = intentPath()) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(intent, null, 2)}\n`);
}

function pathsMatch(a, b) {
  if (!a || !b) return false;
  try {
    return path.resolve(a) === path.resolve(b);
  } catch {
    return false;
  }
}

/**
 * Stamp one file. Returns { stamped: boolean, reason?: string }.
 */
export function stampMarkdownFile(filePath, meta = {}) {
  if (!shouldStamp(filePath)) {
    return { stamped: false, reason: "denied-or-not-md" };
  }
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return { stamped: false, reason: `read-failed: ${e.message}` };
  }

  // Skip if we just stamped the identical block at the top (hook re-entry / no-op edit)
  const block = formatProvenanceBlock(meta);
  if (content.startsWith(block.trimEnd()) || content.startsWith(block)) {
    return { stamped: false, reason: "already-top" };
  }

  const next = prependProvenance(content, block);
  try {
    fs.writeFileSync(filePath, next);
  } catch (e) {
    return { stamped: false, reason: `write-failed: ${e.message}` };
  }
  return { stamped: true };
}

/**
 * Hook main: parse stdin payload, resolve intent, stamp.
 */
export function handleHookPayload(payload, opts = {}) {
  const env = opts.env || process.env;
  const filePath = extractFilePath(payload);
  if (!filePath) return { stamped: false, reason: "no-path" };
  if (!shouldStamp(filePath)) return { stamped: false, reason: "denied-or-not-md" };

  const intentFile = opts.intentFile || intentPath(opts.home);
  const intent = loadIntent(intentFile);
  let why = "unspecified";
  let trigger =
    payload.tool_name ||
    payload.hook_event_name ||
    "file-edit";
  let who = detectWho(payload, env);

  if (intent && pathsMatch(intent.path, filePath)) {
    if (intent.why) why = intent.why;
    if (intent.trigger) trigger = intent.trigger;
    if (intent.who) who = intent.who;
    clearIntent(intentFile);
  }

  const host = detectHost(payload, env);
  const when = new Date().toISOString();
  return stampMarkdownFile(filePath, { who, when, why, trigger, host });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  try {
    const raw = await readStdin();
    let payload = {};
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        // some hosts may pass path-only; ignore
        payload = {};
      }
    }
    // Allow CLI: node md-provenance.mjs --stamp /path/file.md
    const stampIdx = process.argv.indexOf("--stamp");
    if (stampIdx !== -1 && process.argv[stampIdx + 1]) {
      payload = { ...payload, file_path: process.argv[stampIdx + 1] };
    }
    handleHookPayload(payload);
  } catch (e) {
    if (process.env.O9K_DEBUG === "1") {
      console.error("md-provenance:", e.message || e);
    }
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
