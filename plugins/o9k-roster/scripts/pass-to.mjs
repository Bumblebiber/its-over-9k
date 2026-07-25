// pass-to.mjs — resolve a free-form model string to {cli, model} for manual
// session handoff. Roster-first (exact → fuzzy); heuristic only when no hits.
// Pure: no I/O. Kept separate from roster.mjs to avoid circular imports.

const KNOWN_CLIS = new Set(["claude", "codex", "cursor", "opencode", "hermes"]);

/** Parse "cli:model" pin; null if not that shape. */
function parsePin(query) {
  const q = String(query || "").trim();
  const i = q.indexOf(":");
  if (i <= 0) return null;
  const cli = q.slice(0, i);
  const model = q.slice(i + 1);
  if (!cli || !model) return null;
  return { cli, model };
}

/**
 * Guess CLI from a free model string when roster has no match.
 * @returns {{ cli: string, model: string } | null}
 */
export function heuristicCliModel(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  // Explicit cli:model (even if model unknown to roster)
  const pin = parsePin(q);
  if (pin && KNOWN_CLIS.has(pin.cli)) return pin;

  const l = q.toLowerCase();
  if (/^(opus|sonnet|haiku|claude|fable)/.test(l) || l.includes("claude")) {
    return { cli: "claude", model: q };
  }
  if (/^(composer|grok)/.test(l) || l.includes("cursor")) {
    return { cli: "cursor", model: q };
  }
  if (/^gpt/.test(l) || l.includes("codex") || l.includes("o3") || l.includes("o4")) {
    return { cli: "codex", model: q };
  }
  if (/deepseek|qwen|llama|hermes/.test(l)) {
    return { cli: "hermes", model: q };
  }
  return null;
}

function candidate(modelId, cli, source) {
  return {
    model: modelId,
    cli,
    label: cli ? `${cli}:${modelId}` : modelId,
    source,
  };
}

/**
 * Collect roster candidates for a query.
 * Exact (model key, cli_model, cli:model label) wins alone over fuzzy.
 * Multiple exact or multiple fuzzy → ambiguous (caller asks human).
 */
export function findRosterMatches(query, roster) {
  const q = String(query || "").trim();
  if (!q) return [];
  const ql = q.toLowerCase();
  const models = roster?.models || {};
  const exact = [];
  const fuzzy = [];
  const seen = new Set();

  const push = (list, c) => {
    const key = `${c.cli}:${c.model}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(c);
  };

  // Bare cli:model pin against roster
  const pin = parsePin(q);
  if (pin && models[pin.model]) {
    const m = models[pin.model];
    if (!Array.isArray(m.cli) || m.cli.length === 0 || m.cli.includes(pin.cli)) {
      push(exact, candidate(pin.model, pin.cli, "exact-pin"));
    }
  }

  for (const [id, model] of Object.entries(models)) {
    if (!model || typeof model !== "object") continue;
    const cli = model.cli?.[0] ?? null;
    if (!cli) continue;
    const cliModel = (model.cli_model || id).toLowerCase();
    const idL = id.toLowerCase();
    const labelL = `${cli}:${id}`.toLowerCase();

    if (idL === ql || cliModel === ql || labelL === ql) {
      push(exact, candidate(id, cli, "exact"));
      continue;
    }
    if (
      idL.includes(ql) ||
      ql.includes(idL) ||
      cliModel.includes(ql) ||
      ql.includes(cliModel) ||
      labelL.includes(ql)
    ) {
      push(fuzzy, candidate(id, cli, "fuzzy"));
    }
  }

  if (exact.length) return exact;
  return fuzzy;
}

/**
 * Resolve pass-to target.
 * @returns {{
 *   status: "ok"|"ambiguous"|"unresolved"|"error",
 *   model?: string,
 *   cli?: string,
 *   label?: string,
 *   source?: string,
 *   matches?: object[],
 *   reason?: string,
 *   query?: string
 * }}
 */
export function resolvePassTo(query, roster) {
  const q = String(query || "").trim();
  if (!q) return { status: "error", reason: "empty query" };

  const matches = findRosterMatches(q, roster);
  if (matches.length === 1) {
    const m = matches[0];
    return {
      status: "ok",
      model: m.model,
      cli: m.cli,
      label: m.label,
      source: m.source,
    };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", matches, query: q };
  }

  const heur = heuristicCliModel(q);
  if (heur) {
    // Prefer roster CLI template existence
    if (roster?.clis && !roster.clis[heur.cli]) {
      return {
        status: "unresolved",
        query: q,
        reason: `heuristic cli "${heur.cli}" has no clis template in roster`,
      };
    }
    return {
      status: "ok",
      model: heur.model,
      cli: heur.cli,
      label: `${heur.cli}:${heur.model}`,
      source: "heuristic",
    };
  }

  return { status: "unresolved", query: q, reason: "no roster match and no CLI heuristic" };
}
