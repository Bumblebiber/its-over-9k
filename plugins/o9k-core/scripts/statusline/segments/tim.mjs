import { execFileSync } from "node:child_process";

export function renderTim(canonical, opts = {}) {
  if (typeof opts.runTim === "function") {
    const v = opts.runTim(canonical);
    return v || "tim:—";
  }
  try {
    const out = execFileSync("tim", ["statusline", "--cwd", canonical?.cwd || process.cwd()], {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 800,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || "tim:—";
  } catch {
    return "tim:—";
  }
}
