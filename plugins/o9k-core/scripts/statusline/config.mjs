// config.mjs — ~/.o9k/statusline.json read/write (O9K_STATUSLINE override).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ELEMENT_KEYS = ["tim", "device", "limits", "context", "model", "git"];

export function configPath() {
  return process.env.O9K_STATUSLINE || path.join(os.homedir(), ".o9k/statusline.json");
}

export function defaultConfig(overrides = {}) {
  return {
    version: 1,
    enabled: true,
    elements: ["tim", "device", "limits", "context", "model", "git"],
    priority: ["limits", "tim", "context", "model", "device", "git"],
    marquee: { enabled: true, keys: ["git", "tim"] },
    hosts: { claude: true, cursor: true, hermes: true },
    ...overrides,
  };
}

export function loadConfig(opts = {}) {
  const p = opts.path || configPath();
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    return null;
  }
}

export function saveConfig(cfg, opts = {}) {
  const p = opts.path || configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`);
}
