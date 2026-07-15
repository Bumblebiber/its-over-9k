#!/usr/bin/env node
// o9k-migrate.mjs — export-first migration driver for the /o9k-init skill.
//
// Usage:
//   node o9k-migrate.mjs --list             what can be migrated (from the registry)
//   node o9k-migrate.mjs <rival-id>         export a rival's data before uninstall
//   node o9k-migrate.mjs <rival-id> --dest <dir>
//
// Contract (matches the o9k-init skill, Step 4):
//   - data is NEVER deleted or modified — this script only copies OUT
//   - raw data lands in ~/o9k-migration-<YYYY-MM-DD>/<rival>/raw/
//   - where the format is parseable, a normalized exchange.json is written
//     next to it; the agent feeds that into the target (hmem / beads)
//   - NOTES.md tells the agent (and the user) what to do with the export
//   - MANIFEST.json records what was found, copied, and skipped
//
// Zero dependencies. Uninstalling the rival stays a separate, explicit step.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRegistry } from "./detect.mjs";

const REG = loadRegistry();
const args = process.argv.slice(2);

function rivalsWithAdapters() {
  return Object.entries(REG.frameworks).filter(
    ([, f]) => f.kind === "rival" && f.migrate?.adapter
  );
}

if (!args.length || args[0] === "--list") {
  console.log("Migratable rivals (registry-driven):");
  for (const [id, f] of rivalsWithAdapters()) {
    const target = f.migrate.target
      ? ` → ${REG.frameworks[f.migrate.target]?.label || f.migrate.target}`
      : " (export/notes only)";
    console.log(`  ${id.padEnd(16)} ${f.label}${target}  [adapter: ${f.migrate.adapter}]`);
  }
  process.exit(0);
}

const id = args[0];
const fw = REG.frameworks[id];
if (!fw || fw.kind !== "rival" || !fw.migrate?.adapter) {
  console.error(`Unknown or non-migratable rival: ${id} — run with --list.`);
  process.exit(1);
}

const destFlag = args.indexOf("--dest");
const dateTag = new Date().toISOString().slice(0, 10);
const dest =
  destFlag !== -1 && args[destFlag + 1]
    ? path.resolve(args[destFlag + 1])
    : path.join(os.homedir(), `o9k-migration-${dateTag}`, id);
const rawDir = path.join(dest, "raw");
fs.mkdirSync(rawDir, { recursive: true });

const manifest = {
  rival: id,
  label: fw.label,
  adapter: fw.migrate.adapter,
  target: fw.migrate.target || null,
  date: new Date().toISOString(),
  copied: [],
  notFound: [],
};
const notes = [];

function expand(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : path.resolve(p);
}

/** Copy a file/dir into raw/ if it exists; record either way. Never throws. */
function copyIn(src) {
  const abs = expand(src);
  try {
    if (!fs.existsSync(abs)) {
      manifest.notFound.push(abs);
      return false;
    }
    const target = path.join(rawDir, path.basename(abs));
    fs.cpSync(abs, target, { recursive: true, force: false, errorOnExist: false });
    manifest.copied.push(abs);
    return true;
  } catch (e) {
    manifest.notFound.push(`${abs} (copy failed: ${e.message})`);
    return false;
  }
}

/** Walk up from cwd looking for a marker dir/file; returns abs path or null. */
function findUp(marker) {
  let dir = process.cwd();
  for (;;) {
    const cand = path.join(dir, marker);
    if (fs.existsSync(cand)) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function writeExchange(obj) {
  fs.writeFileSync(path.join(dest, "exchange.json"), JSON.stringify(obj, null, 2));
}

/** Best-effort: pull text-bearing entries out of every .jsonl under raw/. */
function harvestJsonl() {
  const entries = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
          if (!line.trim()) continue;
          try {
            const o = JSON.parse(line);
            const text = o.text || o.content || o.memory || o.summary;
            if (typeof text === "string" && text.trim())
              entries.push({ text: text.trim(), source: path.basename(p) });
          } catch {
            /* non-JSON line — raw copy has it anyway */
          }
        }
      }
    }
  };
  try {
    walk(rawDir);
  } catch {
    /* best-effort */
  }
  return entries;
}

const ADAPTERS = {
  "claude-mem"() {
    copyIn("~/.claude-mem");
    const entries = harvestJsonl();
    if (entries.length)
      writeExchange({ kind: "memory", source: id, count: entries.length, entries });
    notes.push(
      "Target: hmem. Feed durable insights into hmem via the memory MCP " +
        "(write_memory) — migrate lessons/decisions, NOT chat logs.",
      entries.length
        ? `exchange.json holds ${entries.length} harvested text entries to distill from.`
        : "No parseable entries harvested — distill from raw/ by hand if it matters.",
      "If claude-mem uses a SQLite store, the raw copy preserves it; " +
        "query it read-only if the jsonl harvest missed content."
    );
  },
  mem0() {
    const had = copyIn("~/.mem0");
    notes.push(
      "mem0/OpenMemory is typically a hosted service — a full export must go " +
        "through its dashboard/API BEFORE uninstalling the MCP entry.",
      had ? "Local ~/.mem0 data was copied to raw/." : "No local mem0 data found.",
      "Target: hmem — distill exported memories into hmem entries (insights, not logs)."
    );
  },
  "derived-index"() {
    notes.push(
      `${fw.label} stores a derived index of the repo (graph/vector/cache). ` +
        "It is rebuilt from source at any time — there is nothing worth migrating.",
      "Safe to uninstall once the user confirms; no export needed."
    );
  },
  "task-master"() {
    const tmDir = findUp(".taskmaster");
    if (tmDir) {
      copyIn(tmDir);
      // tasks.json: flat { tasks: [...] } or tagged { <tag>: { tasks: [...] } }
      const tasksFile = path.join(tmDir, "tasks", "tasks.json");
      try {
        const data = JSON.parse(fs.readFileSync(tasksFile, "utf8"));
        const lists = Array.isArray(data.tasks)
          ? { master: data }
          : data;
        const items = [];
        for (const [tag, box] of Object.entries(lists)) {
          for (const t of box?.tasks || []) {
            items.push({
              tag,
              id: t.id,
              title: t.title,
              description: t.description || "",
              status: t.status || "pending",
              dependencies: t.dependencies || [],
              priority: t.priority || null,
            });
          }
        }
        if (items.length)
          writeExchange({ kind: "tasks", source: id, count: items.length, items });
        notes.push(
          items.length
            ? `exchange.json holds ${items.length} tasks. Recreate the OPEN ones in ` +
              "beads (`bd create` per item, then wire dependencies); done/stale " +
              "items stay in the export only."
            : "tasks.json found but no tasks parsed — check raw/ by hand."
        );
      } catch {
        notes.push("No parseable tasks.json — raw/ has the full .taskmaster/ copy.");
      }
    } else {
      notes.push(
        "No .taskmaster/ found walking up from cwd — run this from inside the " +
          "project that used task-master, or export per-project before uninstalling."
      );
    }
    notes.push("Target: beads. One plan owner — uninstall task-master only after import.");
  },
  "repo-docs"() {
    let found = 0;
    for (const d of fw.migrate.dirs || []) if (copyIn(d)) found++;
    notes.push(
      "Specs/PRDs are project documents — their natural home is the repo " +
        "(e.g. docs/), they need no new owner. The copy in raw/ is a safety net.",
      found ? `${found} doc location(s) backed up.` : "No doc directories found at the checked paths.",
      "Uninstalling the tool does not touch documents that live in the repo."
    );
  },
  "home-config"() {
    let found = 0;
    for (const d of fw.migrate.dirs || []) if (copyIn(d)) found++;
    notes.push(
      found
        ? `${found} config location(s) backed up to raw/.`
        : "No local config found at the checked paths.",
      "Commands/config of a methodology suite have no o9k equivalent to import " +
        "into — the backup is for reference only."
    );
  },
};

ADAPTERS[fw.migrate.adapter]();

fs.writeFileSync(
  path.join(dest, "NOTES.md"),
  `# ${fw.label} → migration notes (${dateTag})\n\n` +
    notes.map((n) => `- ${n}`).join("\n") +
    "\n\nRule one: this export is never deleted, even after a successful migration.\n"
);
fs.writeFileSync(path.join(dest, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

console.log(`== o9k migrate: ${fw.label} ==`);
console.log(`export dir : ${dest}`);
console.log(`copied     : ${manifest.copied.length ? manifest.copied.join(", ") : "nothing (see NOTES.md)"}`);
if (fs.existsSync(path.join(dest, "exchange.json"))) console.log("exchange   : exchange.json written (normalized)");
console.log("next steps :");
for (const n of notes) console.log(`  - ${n}`);
console.log("");
console.log("Nothing was uninstalled or modified — that stays an explicit, separate step.");
