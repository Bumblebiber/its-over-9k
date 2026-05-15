/**
 * cli-session-summary.ts
 *
 * Spawns a checkpoint agent to write a session summary (L2 body) for a completed session.
 * Called async from SessionStart hook when previous session lacks a summary.
 *
 * Usage: hmem summarize-session O0048.3
 */

import fs from "node:fs";
import path from "node:path";
import { HmemStore } from "./hmem-store.js";
import { loadHmemConfig } from "./hmem-config.js";
import { resolveEnvDefaults } from "./cli-env.js";
import { runCheckpointAgent } from "./cli-checkpoint-agent.js";

export async function summarizeSession(sessionId: string): Promise<void> {
  if (!sessionId) {
    console.error("[hmem summarize-session] No session ID provided");
    process.exit(1);
  }

  resolveEnvDefaults();
  const projectDir = process.env.HMEM_PROJECT_DIR!;
  if (!projectDir) process.exit(0);

  const hmemPath = process.env.HMEM_PATH!;
  if (!fs.existsSync(hmemPath)) process.exit(0);

  const config = loadHmemConfig(path.dirname(hmemPath));
  const store = new HmemStore(hmemPath, config);

  try {
    const batches = store.getChildNodes(sessionId);
    if (batches.length === 0) return;

    const batchSummaries = batches
      .filter(b => b.depth === 3 && b.content !== b.title)
      .map(b => `${b.id}: ${b.content}`)
      .join("\n\n");

    if (!batchSummaries) return;

    const prompt = `Summarize session ${sessionId}.

== Batch Summaries ==
${batchSummaries}

## Task
Write a compact session summary (max 200 words) as the body of ${sessionId}.
What was achieved? What's still open?
Match the language of the batch summaries.

update_memory(id="${sessionId}", content="Session summary text here")`;

    await runCheckpointAgent(prompt, store, config, hmemPath);
    console.log(`[hmem] Session summary written for ${sessionId} (${config.checkpointProvider}/${config.checkpointModel})`);

  } catch (e) {
    console.error(`[hmem summarize-session] ${e}`);
  } finally {
    try { store.close(); } catch {}
  }
}
