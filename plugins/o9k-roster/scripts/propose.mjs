// propose.mjs — pure score→chain proposal + semiauto apply gates.
// No I/O. Spec: docs/superpowers/specs/2026-07-16-o9k-roster-scores-design.md

import { parseChainEntry } from "./roster.mjs";

/** AA blended convention: (3*in + 1*out) / 4 per 1M tokens. */
export function blendedPrice(price) {
  if (!price || typeof price.in !== "number" || typeof price.out !== "number") return null;
  return (3 * price.in + price.out) / 4;
}

/** Primary score fields per role (AA three-family map). */
export const ROLE_SCORE_FIELDS = {
  implementer: ["coding_index"],
  "test-writer": ["coding_index"],
  "frontend-designer": ["coding_index"],
  scout: ["agentic_index"],
  researcher: ["agentic_index"],
  planner: ["agentic_index", "coding_index"],
  reviewer: ["agentic_index", "coding_index"],
  "prompt-writer": ["intelligence_index"],
  triager: ["intelligence_index"],
  summarizer: ["intelligence_index"],
};

export function scoreForRole(scores, role) {
  const fields = ROLE_SCORE_FIELDS[role] || ["coding_index"];
  for (const f of fields) {
    const v = scores?.[f];
    if (typeof v === "number") return v;
  }
  return null;
}

function cellKey(cli, model) {
  return `${cli}:${model}`;
}

function resolveHead(roster, role) {
  const chain = roster.roles?.[role]?.chain;
  if (!Array.isArray(chain) || chain.length === 0) return null;
  const { model, cli: pinned } = parseChainEntry(chain[0]);
  const mod = roster.models?.[model];
  const cli = pinned ?? mod?.cli?.[0] ?? null;
  if (!cli || !model) return null;
  return { cli, model, entry: chain[0] };
}

/**
 * Build ranked CLI×model candidates for a role from scores cache + roster.
 */
export function buildCandidates({ roster, scoresFile, role, preferClis }) {
  const prefer = preferClis || roster.scores?.prefer_clis || [
    "hermes", "opencode", "cursor", "codex", "claude",
  ];
  const precomputed = scoresFile.role_scores?.[role];
  if (Array.isArray(precomputed) && precomputed.length) {
    return precomputed
      .map((c) => ({
        cli: c.cli,
        model: c.model,
        score: c.score,
        blended: typeof c.blended === "number" ? c.blended : blendedPrice(c.price),
      }))
      .filter((c) => typeof c.score === "number")
      .sort((a, b) => b.score - a.score || (a.blended ?? 1e9) - (b.blended ?? 1e9));
  }

  const out = [];
  for (const [modelId, mod] of Object.entries(scoresFile.models || {})) {
    const score = scoreForRole(mod.scores, role);
    if (score === null) continue;
    const clis = roster.models?.[modelId]?.cli
      || mod.hosted_clis
      || [];
    const allowed = clis.filter((c) => roster.clis?.[c]?.cmd);
    const ordered = [
      ...prefer.filter((c) => allowed.includes(c)),
      ...allowed.filter((c) => !prefer.includes(c)),
    ];
    for (const cli of ordered) {
      out.push({
        cli,
        model: modelId,
        score,
        blended: blendedPrice(mod.price),
      });
      break; // one cell per model (preferred CLI)
    }
  }
  out.sort((a, b) => b.score - a.score || (a.blended ?? 1e9) - (b.blended ?? 1e9));
  return out;
}

/**
 * Propose chain updates. Returns { applied: [...], skipped: [...] } where
 * each item describes a role change. Pure — does not mutate roster.
 *
 * Semiauto gates (all required to land in `applied`):
 * - score >= current + min_delta
 * - blended <= current blended (cost must not rise; cost_slack optional)
 * - role not pin_head
 */
export function proposeRoleChanges({ roster, scoresFile, now = Date.now() }) {
  const minDelta = roster.scores?.min_delta ?? 2.0;
  const costSlack = roster.scores?.cost_slack ?? 0;
  const applied = [];
  const skipped = [];

  for (const role of Object.keys(roster.roles || {})) {
    const head = resolveHead(roster, role);
    const candidates = buildCandidates({ roster, scoresFile, role });
    if (!candidates.length) {
      skipped.push({ role, reason: "no candidates" });
      continue;
    }
    const best = candidates[0];
    const pin = roster.roles[role]?.pin_head === true;

    let currentScore = null;
    let currentBlended = null;
    if (head) {
      const m = scoresFile.models?.[head.model];
      currentScore = scoreForRole(m?.scores, role);
      currentBlended = blendedPrice(m?.price);
      // prefer role_scores match for current head if present
      const hit = (scoresFile.role_scores?.[role] || []).find(
        (c) => c.model === head.model && c.cli === head.cli
      );
      if (hit) {
        currentScore = hit.score;
        if (typeof hit.blended === "number") currentBlended = hit.blended;
      }
    }

    const sameHead = head && head.model === best.model && head.cli === best.cli;
    if (sameHead) {
      skipped.push({ role, reason: "already optimal", head: best });
      continue;
    }

    if (pin) {
      skipped.push({
        role,
        reason: "pin_head",
        current: head,
        proposed: best,
      });
      continue;
    }

    if (currentScore !== null && best.score < currentScore + minDelta) {
      skipped.push({
        role,
        reason: `score delta ${ (best.score - (currentScore ?? 0)).toFixed(1) } < min_delta ${minDelta}`,
        current: head && { ...head, score: currentScore, blended: currentBlended },
        proposed: best,
      });
      continue;
    }

    if (
      currentBlended !== null &&
      best.blended !== null &&
      best.blended > currentBlended * (1 + costSlack)
    ) {
      skipped.push({
        role,
        reason: "cost would increase",
        current: head && { ...head, score: currentScore, blended: currentBlended },
        proposed: best,
      });
      continue;
    }

    // New head with no current scores: only auto-apply if we have no head or no score data
    if (head && currentScore === null) {
      skipped.push({
        role,
        reason: "current head unscored — manual review",
        current: head,
        proposed: best,
      });
      continue;
    }

    applied.push({
      role,
      current: head && { ...head, score: currentScore, blended: currentBlended },
      proposed: best,
      entry: `${best.cli}:${best.model}`,
    });
  }

  return { applied, skipped, at: new Date(now).toISOString() };
}

/**
 * Apply gated changes onto a roster clone. Adds missing open-weight models
 * when auto_add_open_weight (default true).
 */
export function applyProposals({ roster, scoresFile, proposals }) {
  const next = structuredClone(roster);
  const autoAdd = next.scores?.auto_add_open_weight !== false;

  for (const change of proposals.applied || []) {
    const { role, proposed, entry } = change;
    if (!next.roles[role]) continue;

    if (!next.models[proposed.model] && autoAdd) {
      const src = scoresFile.models?.[proposed.model];
      if (src?.open_weight) {
        next.models[proposed.model] = {
          provider: src.provider || "open-weight",
          tier: "mid",
          cli: src.hosted_clis || ["hermes", "opencode"],
          price: src.price || { in: null, out: null },
          open_weight: true,
        };
      }
    }

    if (!next.models[proposed.model]) continue;

    const chain = [...(next.roles[role].chain || [])];
    // put new head first; drop duplicate of same model elsewhere
    const filtered = chain.filter((e) => {
      try {
        return parseChainEntry(e).model !== proposed.model;
      } catch {
        return true;
      }
    });
    next.roles[role].chain = [entry, ...filtered];
  }

  return next;
}
