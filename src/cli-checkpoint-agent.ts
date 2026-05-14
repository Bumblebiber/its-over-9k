/**
 * cli-checkpoint-agent.ts
 *
 * Provider-agnostic agentic loop for the checkpoint agent.
 * Replaces the `claude -p --model haiku` subprocess spawn.
 *
 * Supports: Anthropic (native), OpenAI-compatible (OpenAI, DeepSeek, Groq, etc.)
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { HmemStore } from "./hmem-store.js";
import { HmemConfig } from "./hmem-config.js";

// ── Tool schemas (shared between providers) ──────────────────────────────────

const TOOL_SCHEMAS: Record<string, object> = {
  read_memory: {
    type: "object",
    properties: {
      id: { type: "string", description: "Node ID, e.g. 'P0048' or 'O0048.3'" },
      search: { type: "string", description: "Full-text search query" },
      prefix: { type: "string", description: "Filter by category prefix (L, P, D, E, ...)" },
    },
  },
  write_memory: {
    type: "object",
    properties: {
      prefix: { type: "string", description: "Entry prefix: L, D, E, R, C" },
      content: { type: "string", description: "Title + optional body (tab-indented children)" },
      tags: { type: "array", items: { type: "string" }, description: "Hashtags, e.g. ['#hmem', '#bug']" },
      links: { type: "array", items: { type: "string" }, description: "Linked entry IDs" },
    },
    required: ["prefix", "content"],
  },
  update_memory: {
    type: "object",
    properties: {
      id: { type: "string", description: "Node ID to update" },
      content: { type: "string", description: "New content (replaces existing)" },
      tags: { type: "array", items: { type: "string" } },
      irrelevant: { type: "boolean" },
      favorite: { type: "boolean" },
    },
    required: ["id"],
  },
  append_memory: {
    type: "object",
    properties: {
      id: { type: "string", description: "Parent node ID" },
      content: { type: "string", description: "Child content (tab-indented for nesting)" },
    },
    required: ["id", "content"],
  },
  move_nodes: {
    type: "object",
    properties: {
      node_ids: { type: "array", items: { type: "string" }, description: "Exchange node IDs to move" },
      target_o_id: { type: "string", description: "Target O-entry ID, e.g. 'O0042'" },
    },
    required: ["node_ids", "target_o_id"],
  },
  list_projects: {
    type: "object",
    properties: {},
  },
};

// ── Tool executor ─────────────────────────────────────────────────────────────

function executeTool(name: string, input: Record<string, unknown>, store: HmemStore): string {
  try {
    switch (name) {
      case "read_memory": {
        const { id, search, prefix } = input as { id?: string; search?: string; prefix?: string };
        const entries = store.read({ id, search, prefix, depth: 3 });
        if (!entries.length) return "No results found.";
        return entries.slice(0, 20).map(e => `${e.id}  ${e.level_1 ?? ""}${e.level_2 ? "\n  " + e.level_2 : ""}`).join("\n");
      }
      case "write_memory": {
        const { prefix, content, tags, links } = input as { prefix: string; content: string; tags?: string[]; links?: string[] };
        const result = store.write(prefix, content as string, links, undefined, undefined, tags);
        return `Created: ${result.id}`;
      }
      case "update_memory": {
        const { id, content, tags, irrelevant, favorite } = input as { id: string; content?: string; tags?: string[]; irrelevant?: boolean; favorite?: boolean };
        const ok = store.updateNode(id as string, content, undefined, undefined, favorite, undefined, irrelevant, tags);
        return ok ? `Updated: ${id}` : `Not found: ${id}`;
      }
      case "append_memory": {
        const { id, content } = input as { id: string; content: string };
        const result = store.appendChildren(id as string, content as string);
        return `Appended ${result.count} node(s): ${result.ids.join(", ")}`;
      }
      case "move_nodes": {
        const { node_ids, target_o_id } = input as { node_ids: string[]; target_o_id: string };
        const result = store.moveNodes(node_ids as string[], target_o_id as string);
        return `Moved ${result.moved}. Errors: ${result.errors.join(", ") || "none"}`;
      }
      case "list_projects": {
        const projects = store.listProjects();
        return projects.map(p => `  ${p.id}  ${p.title}`).join("\n");
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e: any) {
    return `Error: ${e?.message ?? String(e)}`;
  }
}

// ── Anthropic loop ────────────────────────────────────────────────────────────

async function runAnthropicLoop(prompt: string, store: HmemStore, config: HmemConfig): Promise<void> {
  const apiKeyEnv = config.checkpointApiKeyEnv ?? "ANTHROPIC_API_KEY";
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) throw new Error(`Missing env var: ${apiKeyEnv}`);

  const client = new Anthropic({ apiKey });

  const tools: Anthropic.Tool[] = Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
    name,
    description: `hmem ${name}`,
    input_schema: schema as Anthropic.Tool["input_schema"],
  }));

  type Msg = Anthropic.MessageParam;
  const messages: Msg[] = [{ role: "user", content: prompt }];

  for (let i = 0; i < 40; i++) {
    const response = await client.messages.create({
      model: config.checkpointModel,
      max_tokens: 4096,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) break;

    const results: Anthropic.ToolResultBlockParam[] = toolUses.map(block => ({
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: executeTool(block.name, block.input as Record<string, unknown>, store),
    }));

    messages.push({ role: "user", content: results });
  }
}

// ── OpenAI-compatible loop ────────────────────────────────────────────────────

async function runOpenAILoop(prompt: string, store: HmemStore, config: HmemConfig): Promise<void> {
  const apiKeyEnv = config.checkpointApiKeyEnv ?? "OPENAI_API_KEY";
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) throw new Error(`Missing env var: ${apiKeyEnv}`);

  const client = new OpenAI({
    apiKey,
    ...(config.checkpointBaseUrl ? { baseURL: config.checkpointBaseUrl } : {}),
  });

  const tools: OpenAI.ChatCompletionTool[] = Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
    type: "function" as const,
    function: { name, description: `hmem ${name}`, parameters: schema as OpenAI.FunctionParameters },
  }));

  type Msg = OpenAI.ChatCompletionMessageParam;
  const messages: Msg[] = [{ role: "user", content: prompt }];

  for (let i = 0; i < 40; i++) {
    const response = await client.chat.completions.create({
      model: config.checkpointModel,
      tools,
      messages,
    });

    const choice = response.choices[0];
    if (!choice) break;

    messages.push(choice.message);

    if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) break;

    for (const call of choice.message.tool_calls) {
      if (!("function" in call)) continue;
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(call.function.arguments); } catch {}
      const result = executeTool(call.function.name, input, store);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runCheckpointAgent(
  prompt: string,
  store: HmemStore,
  config: HmemConfig,
): Promise<void> {
  if (config.checkpointProvider === "openai") {
    await runOpenAILoop(prompt, store, config);
  } else {
    await runAnthropicLoop(prompt, store, config);
  }
}
