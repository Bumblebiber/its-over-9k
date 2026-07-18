import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function marqueePath(opts = {}) {
  return (
    opts.marqueePath ||
    process.env.O9K_STATUSLINE_MARQUEE ||
    path.join(os.homedir(), ".o9k/statusline-marquee.json")
  );
}

export function loadOffsets(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

export function saveOffsets(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify(obj)}\n`);
  } catch {
    // ignore
  }
}

export function applyMarquee(key, text, slot, statePath) {
  if (slot <= 0) return "";
  if (text.length <= slot) return text;
  const loop = `${text} · `;
  const offsets = loadOffsets(statePath);
  const off = (Number(offsets[key]) || 0) % loop.length;
  offsets[key] = off + 1;
  saveOffsets(statePath, offsets);
  let out = "";
  for (let i = 0; i < slot; i++) out += loop[(off + i) % loop.length];
  return out;
}
