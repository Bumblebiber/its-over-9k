// parse-cursor-usage.mjs — pure parser for cursor-agent /usage table.

const ROW_RE = /^\s*(Included|Auto|API)\s+(\d+)%\s+used/gim;

/**
 * @param {string} text
 * @param {{ now?: string, source?: string }} [opts]
 */
export function parseCursorUsage(text, opts = {}) {
  const updated = opts.now || new Date().toISOString();
  const source = opts.source || "cursor:/usage";
  const windows = {};
  for (const m of text.matchAll(ROW_RE)) {
    const slug = m[1].toLowerCase();
    windows[`cursor:${slug}`] = {
      used: Number(m[2]) / 100,
      resets_at: null,
      updated,
      source,
    };
  }
  return windows;
}
