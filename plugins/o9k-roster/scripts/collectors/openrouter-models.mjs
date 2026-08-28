// openrouter-models.mjs — catalog, prices, open-weight detection.
// Hosted open-weight only (Hermes/OpenCode routes) — no local Ollama.

import {
  loadIdMap,
  mapId,
  perMillion,
} from "./openrouter-benchmarks.mjs";

/**
 * Detect open-weight / open-source hosted models.
 * Isolated so OpenRouter schema drift is a one-function fix.
 */
export function isOpenWeight(model) {
  if (!model || typeof model !== "object") return false;
  if (model.hugging_face_id) return true;
  if (model.huggingface_id) return true;
  if (model.open_weights === true || model.open_weight === true) return true;
  const lic = String(model.license || model.licensing || "").toLowerCase();
  if (lic && !/proprietary|unknown|null/.test(lic) && /apache|mit|llama|open|gpl|bsd/.test(lic)) {
    return true;
  }
  // Known open-weight org prefixes on OpenRouter
  const id = String(model.id || model.canonical_slug || "");
  if (/^(meta-llama|deepseek|qwen|mistralai|google\/gemma|nousresearch|microsoft\/phi)/i.test(id)) {
    return true;
  }
  return false;
}

export function normalizeModels(payload, idMap = loadIdMap()) {
  const rows = payload?.data || payload?.models || [];
  const models = {};
  for (const row of rows) {
    const oid = row.id || row.canonical_slug;
    if (!oid) continue;
    const id = mapId(oid, idMap);
    // models endpoint pricing is typically USD per million tokens as strings
    let priceIn = Number(row.pricing?.prompt);
    let priceOut = Number(row.pricing?.completion);
    if (!Number.isFinite(priceIn)) priceIn = perMillion(row.pricing?.prompt);
    if (!Number.isFinite(priceOut)) priceOut = perMillion(row.pricing?.completion);

    const open = isOpenWeight(row);
    models[id] = {
      openrouter_id: oid,
      display_name: row.name,
      open_weight: open,
      hosted_clis: open ? ["hermes", "opencode"] : undefined,
      price:
        Number.isFinite(priceIn) && Number.isFinite(priceOut)
          ? { in: priceIn, out: priceOut }
          : undefined,
      provider: oid.split("/")[0],
      provenance: ["openrouter-models"],
    };
  }
  return {
    models,
    source: { as_of: new Date().toISOString() },
  };
}

export async function fetchModels({
  apiKey = process.env.OPENROUTER_API_KEY,
  fetchFn = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY required for live models fetch");
  const res = await fetchFn("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`openrouter models HTTP ${res.status}`);
  return res.json();
}
