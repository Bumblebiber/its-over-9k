// scores.mjs — merge collectors into ~/.o9k/roster-scores.json + role_scores.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeBenchmarks,
  fetchBenchmarks,
  loadFixture,
} from "./collectors/openrouter-benchmarks.mjs";
import {
  normalizeModels,
  fetchModels,
} from "./collectors/openrouter-models.mjs";
import { blendedPrice, scoreForRole, ROLE_SCORE_FIELDS } from "./propose.mjs";

export function scoresPath() {
  return process.env.O9K_SCORES || path.join(os.homedir(), ".o9k/roster-scores.json");
}

function mergeModel(a = {}, b = {}) {
  return {
    ...a,
    ...b,
    scores: { ...(a.scores || {}), ...(b.scores || {}) },
    price: b.price || a.price,
    open_weight: b.open_weight ?? a.open_weight,
    hosted_clis: b.hosted_clis || a.hosted_clis,
    provenance: [...new Set([...(a.provenance || []), ...(b.provenance || [])])],
  };
}

export function mergeCollected({ benchmarks, modelsCatalog }) {
  const models = {};
  for (const [id, m] of Object.entries(benchmarks.models || {})) {
    models[id] = mergeModel(models[id], m);
  }
  for (const [id, m] of Object.entries(modelsCatalog.models || {})) {
    models[id] = mergeModel(models[id], m);
  }
  return {
    updated: new Date().toISOString(),
    sources: {
      "openrouter-benchmarks": benchmarks.source,
      "openrouter-models": modelsCatalog.source,
    },
    models,
  };
}

/** Derive role_scores lists for every known ROLE_SCORE_FIELDS role. */
export function buildRoleScores(scoresFile, roster) {
  const prefer = roster?.scores?.prefer_clis || [
    "hermes", "opencode", "cursor", "codex", "claude",
  ];
  const role_scores = {};
  for (const role of Object.keys(ROLE_SCORE_FIELDS)) {
    const rows = [];
    for (const [modelId, mod] of Object.entries(scoresFile.models || {})) {
      const score = scoreForRole(mod.scores, role);
      if (score === null) continue;
      const clis =
        roster?.models?.[modelId]?.cli ||
        mod.hosted_clis ||
        [];
      const allowed = clis.filter((c) => !roster?.clis || roster.clis[c]?.cmd);
      if (!allowed.length && roster?.clis) continue;
      const useClis = allowed.length ? allowed : clis;
      const cli =
        prefer.find((c) => useClis.includes(c)) || useClis[0];
      if (!cli) continue;
      rows.push({
        cli,
        model: modelId,
        score,
        blended: blendedPrice(mod.price),
        open_weight: !!mod.open_weight,
      });
    }
    rows.sort((a, b) => b.score - a.score || (a.blended ?? 1e9) - (b.blended ?? 1e9));
    role_scores[role] = rows;
  }
  return role_scores;
}

export async function collectScores({ fixtureDir, fetchFn } = {}) {
  let benchRaw;
  let modelsRaw;
  if (fixtureDir) {
    benchRaw = JSON.parse(fs.readFileSync(path.join(fixtureDir, "benchmarks.json"), "utf8"));
    modelsRaw = JSON.parse(fs.readFileSync(path.join(fixtureDir, "models.json"), "utf8"));
  } else {
    benchRaw = await fetchBenchmarks({ fetchFn });
    modelsRaw = await fetchModels({ fetchFn });
  }
  const benchmarks = normalizeBenchmarks(benchRaw);
  const modelsCatalog = normalizeModels(modelsRaw);
  return mergeCollected({ benchmarks, modelsCatalog });
}

export function writeScores(scoresFile, dest = scoresPath()) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(scoresFile, null, 2)}\n`);
  return dest;
}

export function loadScores(filePath = scoresPath()) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

import { fileURLToPath } from "node:url";

export function defaultFixtureDir() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "collectors/fixtures");
}
