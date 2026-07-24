#!/usr/bin/env node
// o9k-statusline.mjs — host statusline command: stdin JSON → one line.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { loadConfig, defaultConfig } from "./config.mjs";
import { normalizePayload } from "./normalize.mjs";
import { renderSegment } from "./segments/index.mjs";
import { renderLine } from "./render.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  let host = "unknown";
  let format = "text";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--host" && argv[i + 1]) host = argv[++i];
    else if (argv[i] === "--format" && argv[i + 1]) format = argv[++i];
  }
  return { host, format };
}

export function runStatusline({ stdin, host, format, config }) {
  // No config file → defaults. Since o9k stopped wiring the statusline
  // itself (docs/STATUSLINE.md), the opt-in IS the user pasting this command
  // into their host config; requiring a second opt-in file on top of that
  // just yields a silently empty status bar. An explicit `enabled: false`
  // still wins.
  const cfg = config ?? loadConfig() ?? defaultConfig();
  if (!cfg.enabled) {
    return format === "hermes" ? "{}\n" : "";
  }
  let raw = null;
  try {
    raw = stdin.trim() ? JSON.parse(stdin) : null;
  } catch {
    raw = null;
  }
  const canonical = normalizePayload(raw, { host });
  const segments = {};
  for (const key of cfg.elements || []) {
    segments[key] = renderSegment(key, canonical);
  }
  const line = renderLine({ config: cfg, segments, width: canonical.width });
  if (format === "hermes") return `${JSON.stringify({ line })}\n`;
  return line ? `${line}\n` : "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { host, format } = parseArgs(process.argv);
  process.stdout.write(runStatusline({ stdin: readStdin(), host, format }));
}
