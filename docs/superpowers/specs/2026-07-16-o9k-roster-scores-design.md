# o9k-roster Scores — Benchmark-Backed Matrix Refresh

**Date:** 2026-07-16
**Status:** Approved (decisions locked)
**Depends on:** `docs/superpowers/specs/2026-07-16-o9k-roster-design.md` (+ CLI×model chain cells)

## Problem

`roster.json` chains are curated by hand. There is no reliable, repeatable
way to learn which **CLI×model** cells perform best for which role, at what
price, including hosted open-weight models reachable via Hermes/OpenCode.
Public chat leaderboards are the wrong signal; agent harness benchmarks and
live price APIs are the right ones.

## Decisions (locked 2026-07-16)

1. **Apply mode = semiauto.** Refresh writes a scores cache always; chain
   updates that pass hard gates are applied automatically (with backup +
   report). Everything else stays propose-only in the report.
2. **Role↔benchmark mapping = AA three-family map is enough** (no custom
   rubrics in v1). Map Coding-Agent-style families onto roster roles; do not
   invent a separate frontend-designer benchmark.
3. **Open source = hosted open-weight only.** Candidates must be reachable
   via Hermes and/or OpenCode through a hosted route (e.g. OpenRouter). No
   local Ollama/vLLM in v1.
4. **Collectors live in the plugin:** `plugins/o9k-roster/scripts/collectors/`.

## Solution overview

```
plugins/o9k-roster/
  scripts/collectors/
    openrouter-benchmarks.mjs   # AA indices + pricing via OpenRouter
    openrouter-models.mjs       # model catalog, open-weight flag, $/MTok
  scripts/scores.mjs            # merge collectors → ~/.o9k/roster-scores.json
  scripts/propose.mjs           # pure: scores + roster → proposed chains + apply set
  scripts/roster.mjs            # new subcommands: refresh | propose | apply-scores
  skills/roster-refresh/SKILL.md
```

User state (never committed):

| File | Owner | Purpose |
|------|-------|---------|
| `~/.o9k/roster.json` | human (+ semiauto apply) | chains, models, clis |
| `~/.o9k/roster-scores.json` | machine | scores, prices, openness, provenance |
| `~/.o9k/roster.json.bak-*` | machine | rolling backup before semiauto apply |

## Data model (`roster-scores.json`)

```json
{
  "updated": "2026-07-16T12:00:00Z",
  "sources": {
    "openrouter-benchmarks": { "as_of": "...", "citation": "..." },
    "openrouter-models": { "as_of": "..." }
  },
  "models": {
    "deepseek-v4-pro": {
      "openrouter_id": "deepseek/deepseek-chat-v4",
      "open_weight": true,
      "hosted_clis": ["hermes", "opencode"],
      "price": { "in": 0.27, "out": 1.10 },
      "scores": {
        "coding_index": 65.0,
        "agentic_index": 58.0,
        "intelligence_index": 60.0
      },
      "provenance": ["openrouter-benchmarks", "openrouter-models"]
    }
  },
  "role_scores": {
    "implementer": [
      { "cli": "codex", "model": "gpt-5.6-sol", "score": 80.0, "blended": 12.5 },
      { "cli": "hermes", "model": "deepseek-v4-pro", "score": 69.0, "blended": 0.48 }
    ]
  }
}
```

- `role_scores` is derived (not scraped): each role gets a ranked list of
  viable CLI×model cells from the mapping below + roster `clis`/`models`
  allow-lists (or discovered open-weight hosted models).
- Blended cost default: `(3*in + 1*out) / 4` per 1M tokens (AA convention),
  overridable in scores config.

## Role ↔ score mapping (v1)

Using Artificial Analysis headline indices exposed via OpenRouter
(`/api/v1/benchmarks?source=artificial-analysis`). When component-level
Coding Agent Index fields become stably available via API, prefer them;
until then map the three *families* onto the indices:

| Roster role | Primary score field | Rationale |
|-------------|---------------------|-----------|
| implementer, test-writer, frontend-designer | `coding_index` | code-change quality |
| scout, researcher | `agentic_index` | tool/terminal/agent loops |
| planner, reviewer | `agentic_index` then `coding_index` as tie-break | long-horizon judgment |
| prompt-writer, triager, summarizer | `intelligence_index` | cheap general competence |

Open-weight hosted models: included in `role_scores` only when
`open_weight === true` **and** at least one of `hermes` / `opencode` is in
`hosted_clis` (or listed in `roster.json` model.cli).

## Semiauto apply gates

A proposed change to a role's chain **auto-applies** iff ALL hold:

1. **Score gate:** proposed head score ≥ current head score + `min_delta`
   (default `2.0` index points).
2. **Cost gate:** proposed head `blended` ≤ current head `blended`
   (strict: cost must not increase). Optional slack `cost_slack` default `0`.
3. **Reachability:** proposed cell's CLI exists in `roster.clis` and model is
   either already in `roster.models` or is an open-weight hosted candidate
   that refresh may **add** under `models` with `cli: ["hermes","opencode"]`
   (and matching `clis` templates).
4. **No human pin break:** if `roles.<role>.pin_head: true`, skip auto-apply
   for that role (propose only).

Otherwise: leave chain unchanged; emit propose line in the report.

On any auto-apply: copy `roster.json` → `roster.json.bak-<iso>` before write.

Config knobs (in `roster.json` under `scores` or env):

```json
"scores": {
  "min_delta": 2.0,
  "cost_slack": 0,
  "auto_add_open_weight": true,
  "prefer_clis": ["hermes", "opencode", "cursor", "codex", "claude"]
}
```

## Collectors

### `openrouter-benchmarks.mjs`

- `GET https://openrouter.ai/api/v1/benchmarks?source=artificial-analysis&max_results=100`
- Auth: `OPENROUTER_API_KEY` (required for live refresh; tests use fixtures).
- Normalize → `{ openrouter_id, coding_index, agentic_index, intelligence_index, pricing? }`.

### `openrouter-models.mjs`

- `GET https://openrouter.ai/api/v1/models`
- Detect open-weight via documented fields (license / `huggingface` /
  architecture metadata — exact detector isolated in one function so it can
  track OpenRouter schema drift).
- Normalize → `{ openrouter_id, price.in, price.out, open_weight, name }`.

### ID mapping

Maintain `plugins/o9k-roster/scripts/collectors/id-map.json` (shipped):
OpenRouter permaslug → roster model id. Unmapped models appear in scores
under their slug; semiauto **add** only when `open_weight` and
`auto_add_open_weight`.

Harness mapping for CLI×model cells (when only model-level scores exist):
use `prefer_clis` ∩ `model.cli` (or default hosted CLIs for open-weight).
True harness×model Coding Agent Index rows (AA page) are a **future
collector** once a stable JSON feed exists — not blocking v1.

## CLI surface (extends `roster.mjs`)

| Command | Behavior |
|---------|----------|
| `refresh [--apply]` | Run collectors → write `roster-scores.json`. With `--apply`, run semiauto gates and maybe rewrite `roster.json`. Always print a report. |
| `propose` | Read scores + roster; print diff; exit 0; never write. |
| `apply-scores` | Apply only the gated subset (same as `refresh --apply` without re-fetch). |

Missing `OPENROUTER_API_KEY`: loud exit for `refresh` (user command); cron
wrapper may soft-fail to report file.

## Skill `roster-refresh`

- When to run: user asks to update the matrix; weekly cron; after major model
  releases.
- Steps: ensure key → `roster.mjs refresh --apply` → show report → tell user
  what changed vs what needs manual review.
- Never invent model rankings in prose — only the scores file.

## Cron

Plugin ships `scripts/roster-refresh-cron.sh` (disk-first report under
`~/.hermes/cron-outputs/roster-refresh/` when Hermes layout present, else
`~/.o9k/reports/roster-refresh/`). Overseer/Hermes cron registers weekly
(e.g. Mo 10h) calling that script — registration is outside the marketplace
repo; the script is the contract.

## Non-goals (v1)

- Local/offline inference (Ollama, vLLM).
- Runtime price optimization inside `pick` (scores inform curation /
  semiauto only).
- Scraping AA HTML.
- Auto-deleting models from `roster.json`.
- Redistributing AA data beyond personal/internal use (attribution in
  scores file `sources.*.citation`).

## Testing

- Collectors: fixture JSON → normalized shape (no network).
- `propose`: hermetic roster + scores → expected apply set / skipped set.
- Semiauto: cost-up never applies; score-up+cost-down applies; `pin_head`
  blocks apply.
- `refresh` without key exits non-zero; with `O9K_SCORES` / fixtures works
  offline via `--fixture-dir`.

## Success criteria

1. `roster refresh --apply` updates prices/scores and can promote an
   open-weight Hermes/OpenCode cell to a role chain when gates pass.
2. Report always lists applied vs proposed-only.
3. Zero network in `node --test`.
4. Skill documents the one command an agent/cron should run.
