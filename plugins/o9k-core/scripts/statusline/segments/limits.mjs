import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function usagePath(opts) {
  return opts.usagePath || process.env.O9K_USAGE || path.join(os.homedir(), ".o9k/usage.json");
}

export function renderLimits(canonical, opts = {}) {
  let usage;
  try {
    usage = JSON.parse(fs.readFileSync(usagePath(opts), "utf8"));
  } catch {
    return "lim:—";
  }
  const host =
    canonical?.host === "cursor" ? "cursor" : canonical?.host === "codex" ? "codex" : "claude";
  const w5 = usage?.windows?.[`${host}:5h`];
  const ww = usage?.windows?.[`${host}:week`] || usage?.windows?.[`${host}:7d`];
  const parts = [];
  if (w5 && typeof w5.used === "number") parts.push(`5h:${Math.round(w5.used * 100)}%`);
  if (ww && typeof ww.used === "number") parts.push(`wk:${Math.round(ww.used * 100)}%`);
  return parts.length ? `lim:${parts.join(" ")}` : "lim:—";
}
