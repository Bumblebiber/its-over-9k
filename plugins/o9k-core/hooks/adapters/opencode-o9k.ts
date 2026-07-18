// o9k OpenCode plugin — wired to ~/.config/opencode/plugins/o9k.ts by wire-opencode.mjs.
// MARKETPLACE and the target list are replaced at wire time; the single
// source of truth for targets is common.mjs's HOOK_WRAPPERS.
import type { Hooks } from "@opencode-ai/plugin";
import { spawnSync } from "node:child_process";
import path from "node:path";

const MARKETPLACE = "__O9K_MARKETPLACE_ROOT__";
const RUN_HOOK = path.join(MARKETPLACE, "o9k-core/hooks/adapters/run-o9k-hook.sh");

const SESSION_START_TARGETS: readonly string[] = __O9K_SESSION_TARGETS__;

function runHook(target: string): string | undefined {
  const result = spawnSync("bash", [RUN_HOOK, target], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, O9K_MARKETPLACE_ROOT: MARKETPLACE },
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
