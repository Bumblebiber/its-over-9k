// o9k OpenCode plugin — wired to ~/.config/opencode/plugins/o9k.ts by wire-opencode.mjs.
// MARKETPLACE is replaced with an absolute path at wire time.
import type { Hooks } from "@opencode-ai/plugin";
import { spawnSync } from "node:child_process";
import path from "node:path";

const MARKETPLACE = "__O9K_MARKETPLACE_ROOT__";
const RUN_HOOK = path.join(MARKETPLACE, "o9k-core/hooks/adapters/run-o9k-hook.sh");

const SESSION_START_TARGETS = [
  "core/session-start",
  "memory/session-start",
  "core/update-check",
] as const;

function runHook(target: string): string | undefined {
  const result = spawnSync("bash", [RUN_HOOK, target], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, O9K_MARKETPLACE_ROOT: MARKETPLACE },
  });
  const out = result.stdout?.trim();
  return out || undefined;
}

export default async (): Promise<Hooks> => ({
  event: async ({ event }) => {
    if (event.type !== "session.created") return;

    for (const target of SESSION_START_TARGETS) {
      const out = runHook(target);
      if (out) console.log(out);
    }
  },
  "experimental.session.compacting": async (_input, output) => {
    const out = runHook("memory/pre-compact");
    if (out) output.context.push(out);
  },
});
