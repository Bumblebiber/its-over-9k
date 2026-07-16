// skills-sync.mjs — install canonical o9k skills + host symlinks / Cursor rules.
//
// Zero dependencies. Copies pillar skills into ~/.agents/skills/o9k/, symlinks
// into each present host's skillDir, and writes Cursor .mdc rules when no
// writable skills path exists.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectHosts } from "./detect.mjs";

const SKILL_SOURCES = [
  ["o9k-core", "using-o9k"],
  ["o9k-core", "o9k-init"],
  ["o9k-core", "o9k-guide"],
  ["o9k-core", "o9k-update"],
  ["o9k-core", "o9k-stats"],
  ["o9k-scout", "scout"],
  ["o9k-dispatch", "dispatch"],
  ["o9k-caveman", "caveman"],
  ["o9k-memory", "memory"],
];

function readSkillMeta(skillPath) {
  try {
    const raw = fs.readFileSync(skillPath, "utf8");
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return { title: path.basename(path.dirname(skillPath)), description: "" };
    let title = path.basename(path.dirname(skillPath));
    let description = "";
    for (const line of m[1].split("\n")) {
      const name = line.match(/^name:\s*(.+)$/);
      const desc = line.match(/^description:\s*"?(.+?)"?\s*$/);
      if (name) title = name[1].trim();
      if (desc) description = desc[1].trim();
    }
    return { title, description };
  } catch {
    return { title: path.basename(path.dirname(skillPath)), description: "" };
  }
}

function buildRuleMdc(name, skillPath, home) {
  const meta = readSkillMeta(skillPath);
  const canonical = path.join(home, ".agents/skills/o9k", name, "SKILL.md");
  const desc = meta.description || `o9k skill: ${name}`;
  return `---
description: ${JSON.stringify(desc)}
alwaysApply: false
---

# ${meta.title}

Read the full skill at \`${canonical}\`.
`;
}

function isIdenticalSymlink(linkPath, target) {
  try {
    const st = fs.lstatSync(linkPath);
    if (!st.isSymbolicLink()) return false;
    const existing = fs.readlinkSync(linkPath);
    const resolved = path.resolve(path.dirname(linkPath), existing);
    return resolved === path.resolve(target);
  } catch {
    return false;
  }
}

function linkExists(linkPath) {
  try {
    fs.lstatSync(linkPath);
    return true;
  } catch {
    return false;
  }
}

function ensureSymlink(target, linkPath, dryRun, errors) {
  if (isIdenticalSymlink(linkPath, target)) return false;

  if (linkExists(linkPath)) {
    const st = fs.lstatSync(linkPath);
    if (!st.isSymbolicLink()) {
      errors.push(`foreign content blocks symlink: ${linkPath}`);
      return false;
    }
    if (!dryRun) fs.unlinkSync(linkPath);
  }

  if (dryRun) return true;
  const type = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(target, linkPath, type);
  return true;
}

function installCanonical(home, marketplaceRoot, canonical, dryRun, errors) {
  for (const [pillar, name] of SKILL_SOURCES) {
    const src = path.join(marketplaceRoot, pillar, "skills", name, "SKILL.md");
    const destDir = path.join(canonical, name);
    const destFile = path.join(destDir, "SKILL.md");
    try {
      if (!fs.existsSync(src)) {
        errors.push(`missing source: ${src}`);
        continue;
      }
      if (dryRun) continue;
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, destFile);
    } catch (e) {
      errors.push(`canonical ${name}: ${e.message}`);
    }
  }
}

export function syncSkills(options = {}) {
  const home = options.home ?? os.homedir();
  const pluginRoot =
    options.pluginRoot ?? fileURLToPath(new URL("..", import.meta.url));
  const marketplaceRoot = options.marketplaceRoot ?? path.join(pluginRoot, "..");
  const dryRun = !!options.dryRun;

  const canonical = path.join(home, ".agents/skills/o9k");
  const linked = [];
  const rules = [];
  const errors = [];

  installCanonical(home, marketplaceRoot, canonical, dryRun, errors);

  const detectOpts = { home };
  if (options.pathEnv !== undefined) detectOpts.pathEnv = options.pathEnv;
  const hosts = detectHosts(detectOpts);

  for (const host of Object.values(hosts)) {
    if (!host.present) continue;

    if (host.skillDir) {
      try {
        if (!dryRun) fs.mkdirSync(host.skillDir, { recursive: true });
        for (const [, name] of SKILL_SOURCES) {
          const canonicalDir = path.join(canonical, name);
          if (!fs.existsSync(canonicalDir)) continue;
          const linkPath = path.join(host.skillDir, `o9k-${name}`);
          if (ensureSymlink(canonicalDir, linkPath, dryRun, errors)) linked.push(linkPath);
        }
      } catch (e) {
        errors.push(`${host.id} skillDir: ${e.message}`);
      }
    }

    if (host.rulesDir) {
      try {
        if (!dryRun) fs.mkdirSync(host.rulesDir, { recursive: true });
        for (const [, name] of SKILL_SOURCES) {
          const rulePath = path.join(host.rulesDir, `o9k-${name}.mdc`);
          const skillPath = path.join(canonical, name, "SKILL.md");
          const srcPath = (() => {
            const pillar = SKILL_SOURCES.find(([, n]) => n === name)?.[0];
            return pillar
              ? path.join(marketplaceRoot, pillar, "skills", name, "SKILL.md")
              : skillPath;
          })();
          if (!dryRun) {
            fs.writeFileSync(rulePath, buildRuleMdc(name, srcPath, home));
          }
          rules.push(rulePath);
        }
      } catch (e) {
        errors.push(`${host.id} rulesDir: ${e.message}`);
      }
    }
  }

  return { canonical, linked, rules, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry-run");
  const r = syncSkills({ dryRun: dry, pluginRoot: process.env.CLAUDE_PLUGIN_ROOT });
  console.log(JSON.stringify(r, null, 2));
}
