// openrouter-benchmarks.mjs — AA indices via OpenRouter Data API.
// fetchFn injectable for hermetic tests.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ID_MAP_PATH = fileURLToPath(new URL("./id-map.json", import.meta.url));

export function loadIdMap(mapPath = ID_MAP_PATH) {
  return JSON.parse(fs.readFileSync(mapPath, "utf8"));
}

export function mapId(openrouterId, idMap) {
  return idMap[openrouterId] || openrouterId.replace(/\//g, "--");
}

/** OpenRouter pricing fields are $/token strings; convert to $/1M tokens. */
export function perMillion(pricePerToken) {
  if (pricePerToken === undefined || pricePerToken === null || pricePerToken === "") return null;
  const n = Number(pricePerToken);
  if (!Number.isFinite(n)) return null;
  // OpenRouter benchmarks cookbook uses per-token; models list often $/M already.
  // Heuristic: values < 0.01 treated as per-token → *1e6; else already per-million.
  return n < 0.01 ? n * 1_000_000 : n;
}

export function normalizeBenchmarks(payload, idMap = loadIdMap()) {
  const rows = payload?.data || [];
  const models = {};
  for (const row of rows) {
    const oid = row.model_permaslug || row.id;
    if (!oid) continue;
    const id = mapId(oid, idMap);
    const priceIn = perMillion(row.pricing?.prompt);
    const priceOut = perMillion(row.pricing?.completion);
    models[id] = {
      openrouter_id: oid,
      display_name: row.display_name || row.name,
      scores: {
        coding_index: row.coding_index ?? null,
        agentic_index: row.agentic_index ?? null,
        intelligence_index: row.intelligence_index ?? null,
      },
      price:
        priceIn !== null && priceOut !== null
          ? { in: priceIn, out: priceOut }
          : undefined,
      provenance: ["openrouter-benchmarks"],
    };
  }
  return {
    models,
    source: {
      as_of: payload?.meta?.as_of || new Date().toISOString(),
      citation: payload?.meta?.citation || "Source: Artificial Analysis via OpenRouter.",
    },
  };
}

export async function fetchBenchmarks({
  apiKey = process.env.OPENROUTER_API_KEY,
  fetchFn = globalThis.fetch,
  maxResults = 100,
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY required for live benchmark fetch");
  const url = new URL("https://openrouter.ai/api/v1/benchmarks");
  url.searchParams.set("source", "artificial-analysis");
  url.searchParams.set("max_results", String(maxResults));
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`openrouter benchmarks HTTP ${res.status}`);
  return res.json();
}

export function loadFixture(name) {
  const p = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
