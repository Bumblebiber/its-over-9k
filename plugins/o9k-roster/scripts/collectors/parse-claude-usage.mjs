// parse-claude-usage.mjs — pure parser for claude /usage output.

const LINE_RE = /^Current\s+(.+?):\s*(\d+)%\s+used(?:\s*·\s*resets\s+(.+?))?\s*$/gim;

/** Map Claude limit labels to window slug (claude:<slug>). */
export function labelToWindowSlug(label) {
  const n = label.trim().toLowerCase();
  if (n === "session") return "session";
  if (n.includes("fable")) return "fable-week";
  if (n.includes("5h") || n.includes("5 h")) return "5h";
  if (n.includes("week") && n.includes("all")) return "week";
  if (n.startsWith("week")) return "week";
  return n.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

/**
 * @param {string} text
 * @param {{ now?: string, source?: string }} [opts]
 * @returns {Record<string, { used: number, resets_at: string|null, updated: string, source: string }>}
 */
export function parseClaudeUsage(text, opts = {}) {
  const updated = opts.now || new Date().toISOString();
  const source = opts.source || "claude:/usage";
  const windows = {};
  for (const m of text.matchAll(LINE_RE)) {
    const slug = labelToWindowSlug(m[1]);
    const key = `claude:${slug}`;
    windows[key] = {
      used: Number(m[2]) / 100,
      resets_at: m[3]?.trim() || null,
      updated,
      source,
    };
  }
  return windows;
}

/** True when at least session + week parsed (fast-path completeness). */
export function claudeParseComplete(windows) {
  return Boolean(windows["claude:session"] && windows["claude:week"]);
}
