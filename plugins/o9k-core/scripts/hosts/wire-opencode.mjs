import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKETPLACE_PLACEHOLDER = "__O9K_MARKETPLACE_ROOT__";
const PRECOMPACT_HOOK = "experimental.session.compacting";
const PRECOMPACT_DETAIL = `preCompact: ${PRECOMPACT_HOOK}`;

function escapeTsString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readTemplate() {
  const templatePath = fileURLToPath(
    new URL("../../hooks/adapters/opencode-o9k.ts", import.meta.url),
  );
  return fs.readFileSync(templatePath, "utf8");
}

export function buildOpencodePluginContent(marketplaceRoot) {
  const resolved = path.resolve(marketplaceRoot);
  if (!readTemplate().includes(MARKETPLACE_PLACEHOLDER)) {
    throw new Error(`opencode-o9k.ts missing ${MARKETPLACE_PLACEHOLDER} marker`);
  }
  return readTemplate().replaceAll(MARKETPLACE_PLACEHOLDER, escapeTsString(resolved));
}

/**
 * Wire o9k hooks into OpenCode via generated ~/.config/opencode/plugins/o9k.ts.
 */
export function wireOpencode({ home, marketplaceRoot, dryRun = false }) {
  const pluginRoot = fileURLToPath(new URL("../..", import.meta.url));
  const resolvedMarketplace = path.resolve(marketplaceRoot ?? path.join(pluginRoot, ".."));
  const runHookPath = path.join(resolvedMarketplace, "o9k-core/hooks/adapters/run-o9k-hook.sh");

  if (!fs.existsSync(runHookPath)) {
    return { ok: false, detail: `missing run-o9k-hook.sh: ${runHookPath}` };
  }

  const pluginsDir = path.join(home, ".config/opencode/plugins");
  const dest = path.join(pluginsDir, "o9k.ts");
  const content = buildOpencodePluginContent(resolvedMarketplace);
  const existing = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
  const changed = existing !== content;

  if (!dryRun && changed) {
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(dest, content);
  }

  const parts = [];
  if (dryRun) parts.push("dry-run: no files written");
  else if (changed) parts.push(`wrote ${dest}`);
  else parts.push(`${dest} unchanged`);
  parts.push(PRECOMPACT_DETAIL);

  return { ok: true, detail: parts.join("; ") };
}
