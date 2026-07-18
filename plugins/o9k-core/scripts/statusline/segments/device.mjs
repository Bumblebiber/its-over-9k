import { execFileSync } from "node:child_process";

export function renderDevice(_canonical, opts = {}) {
  if (typeof opts.runDevice === "function") {
    const v = opts.runDevice();
    return v || "dev:—";
  }
  try {
    const out = execFileSync("tim", ["statusline", "--format", "hermes"], {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 800,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const j = JSON.parse(out);
    return j.device ? String(j.device) : "dev:—";
  } catch {
    return "dev:—";
  }
}
