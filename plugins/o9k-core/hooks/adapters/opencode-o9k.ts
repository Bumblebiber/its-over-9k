// o9k OpenCode plugin — wired to ~/.config/opencode/plugins/o9k.ts by wire-opencode.mjs.
// MARKETPLACE is replaced with an absolute path at wire time.
import type { Hooks } from "@opencode-ai/plugin";
import { spawnSync } from "node:child_process";
import path from "node:path";

const MARKETPLACE = "__O9K_MARKETPLACE_ROOT__";
const RUN_HOOK = path.join(MARKETPLACE, "o9k-core/hooks/adapters/run-o9k-hook.sh");

// Kept in sync by hand with common.mjs's HOOK_WRAPPERS (OpenCode runs this
// as a native plugin, not a shell wrapper, so it can't import that module).
const SESSION_START_TARGETS = [
  "core/session-start",
  "memory/session-start",
  "core/update-check",
  "roster/limit-watch",
] as const;

function runHook(target: string): string | undefined {
  const env: NodeJS.ProcessEnv = { ...process.env, O9K_MARKETPLACE_ROOT: MARKETPLACE };
  if (target === "roster/limit-watch") env.O9K_LIMIT_WATCH_CLI = "opencode";
  const result = spawnSync("bash", [RUN_HOOK, target], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env,
  });
  const out = result.stdout?.trim();
  return out || undefined;
}

// run-o9k-hook.sh's output may either be plain text, or a Claude-style hook
// envelope ({"hookSpecificOutput":{"additionalContext":"..."}}) when the
// underlying hook script targets Claude Code's hook JSON protocol. Unwrap it
// so OpenCode doesn't print/inject the raw JSON blob.
function extractContext(out: string): string {
  try {
    const parsed = JSON.parse(out);
    const ctx = parsed?.hookSpecificOutput?.additionalContext;
    if (typeof ctx === "string") return ctx;
  } catch {
    // not JSON — treat as plain text
  }
  return out;
}

export default async (): Promise<Hooks> => ({
  event: async ({ event }) => {
    if (event.type !== "session.created") return;

    for (const target of SESSION_START_TARGETS) {
      const out = runHook(target);
      if (out) console.log(extractContext(out));
    }
  },
  "experimental.session.compacting": async (_input, output) => {
    const out = runHook("memory/pre-compact");
    if (out) output.context.push(extractContext(out));
  },
});
