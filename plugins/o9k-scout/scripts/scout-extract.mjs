#!/usr/bin/env node
/**
 * scout-extract — high-volume tool output → compact summary (scout pillar).
 *
 * Usage:
 *   node scout-extract.mjs --profile vitest [--max-bytes N] <path>
 *   node scout-extract.mjs --profile vitest [--max-bytes N] < input.json
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { extractVitestJson } from "./extractors/vitest-json.mjs";

const DEFAULT_MAX = 1_048_576;
const HEAD_TAIL = 1024;

const PROFILES = {
  vitest: extractVitestJson,
};

export function parseArgs(argv) {
  let profile = null;
  let maxBytes = DEFAULT_MAX;
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") {
      profile = argv[++i] ?? null;
    } else if (a === "--max-bytes") {
      maxBytes = Number(argv[++i]);
      if (!Number.isFinite(maxBytes) || maxBytes < 1) {
        throw new Error(`invalid --max-bytes: ${argv[i]}`);
      }
    } else if (a.startsWith("-")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }
  return { profile, maxBytes, path: positional[0] ?? null };
}

/**
 * @param {{ profile: string|null, maxBytes: number, path: string|null }} opts
 * @param {{ env?: NodeJS.ProcessEnv, stdin?: Buffer|null }} [io]
 */
export function runExtract(opts, io = {}) {
  const env = io.env ?? process.env;
  const warnings = [];
  /** @type {Buffer} */
  let raw;
  let inBytes;

  if (opts.path) {
    const st = fs.statSync(opts.path);
    inBytes = st.size;
    const fd = fs.openSync(opts.path, "r");
    try {
      const n = Math.min(opts.maxBytes, st.size);
      raw = Buffer.alloc(n);
      fs.readSync(fd, raw, 0, n, 0);
    } finally {
      fs.closeSync(fd);
    }
  } else {
    const stdinBuf = io.stdin ?? fs.readFileSync(0);
    inBytes = stdinBuf.length;
    raw =
      stdinBuf.length > opts.maxBytes
        ? stdinBuf.subarray(0, opts.maxBytes)
        : stdinBuf;
  }

  if (inBytes > opts.maxBytes) {
    warnings.push(`WARN: truncated in=${inBytes} cap=${opts.maxBytes}`);
  }

  if ((env.O9K_SCOUT_EXTRACT ?? "").toLowerCase() === "off") {
    warnings.push("WARN: SCOUT_EXTRACT disabled, pass-through");
    return {
      exitCode: 0,
      stdout: raw,
      stderr: warnings.join("\n") + (warnings.length ? "\n" : ""),
    };
  }

  if (!opts.profile || !PROFILES[opts.profile]) {
    const known = Object.keys(PROFILES).join(", ");
    return {
      exitCode: 2,
      stdout: Buffer.alloc(0),
      stderr: `unknown profile: ${opts.profile ?? "(missing)"}; known: ${known}\n`,
    };
  }

  const text = raw.toString("utf8");
  let summary;
  const result = PROFILES[opts.profile](text);
  if (result.stats?.failed === -1) {
    warnings.push(result.summary.startsWith("WARN:")
      ? result.summary
      : `WARN: ${result.summary}`);
    if (opts.path) warnings.push(`WARN: full log at ${opts.path}`);
    summary = headTail(text);
  } else {
    summary = result.summary;
  }

  const outBuf = Buffer.from(summary, "utf8");
  const receipt = `SCOUT_EXTRACT profile=${opts.profile} in=${inBytes} out=${outBuf.length}`;
  const stderr =
    (warnings.length ? warnings.join("\n") + "\n" : "") + receipt + "\n";

  return { exitCode: 0, stdout: outBuf, stderr };
}

function headTail(text) {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= HEAD_TAIL * 2) {
    return `WARN: parse failed, showing full input\n${text}`;
  }
  const head = buf.subarray(0, HEAD_TAIL).toString("utf8");
  const tail = buf.subarray(buf.length - HEAD_TAIL).toString("utf8");
  return `WARN: parse failed, head/tail ${HEAD_TAIL}B each\n--- head ---\n${head}\n--- tail ---\n${tail}`;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(2);
  }

  let stdin = null;
  if (!opts.path) {
    stdin = fs.readFileSync(0);
  }

  const result = runExtract(opts, { env: process.env, stdin });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout.length) process.stdout.write(result.stdout);
  process.exit(result.exitCode);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
