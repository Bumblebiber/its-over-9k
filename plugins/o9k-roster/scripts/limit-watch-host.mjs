// limit-watch-host.mjs — resolve which roster CLI a limit-watch hook serves.

/** Host ids wired by o9k-init map to roster CLI slugs for usage windows. */
export const LIMIT_WATCH_CLI_BY_HOST = {
  claude: "claude",
  codex: "codex",
  cursor: "cursor",
  hermes: "hermes",
  opencode: "opencode",
};

/**
 * Which CLI this limit-watch invocation should scope to.
 * Explicit O9K_LIMIT_WATCH_CLI wins; otherwise lightweight env heuristics;
 * default claude (Claude Code native per-turn hook).
 */
export function detectLimitWatchCli(env = process.env) {
  const explicit = env.O9K_LIMIT_WATCH_CLI?.trim().toLowerCase();
  if (explicit) return explicit;
  if (env.CURSOR_AGENT || env.CURSOR_INVOKED_AS) return "cursor";
  return "claude";
}
