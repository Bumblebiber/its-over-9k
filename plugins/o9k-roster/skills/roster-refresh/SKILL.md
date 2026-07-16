---
name: roster-refresh
description: "Refresh o9k-roster scores/prices from OpenRouter (Artificial Analysis indices + model catalog), then semiauto-apply chain updates when score rises and cost does not. Use weekly, after major model releases, or when the user asks to update the matrix. Includes hosted open-weight models for Hermes/OpenCode."
---

# roster-refresh — Keep the Matrix Current

Scores and prices are evidence; chains stay deterministic. Never invent
rankings in prose — run the collector.

```bash
ROSTER="node <marketplace>/plugins/o9k-roster/scripts/roster.mjs"
```

Requires `OPENROUTER_API_KEY` for live fetch. Offline smoke:

```bash
$ROSTER refresh --fixture-dir <marketplace>/plugins/o9k-roster/scripts/collectors/fixtures
$ROSTER refresh --fixture-dir ... --apply
```

## Live refresh (normal)

1. Ensure `OPENROUTER_API_KEY` is set.
2. `$ROSTER refresh` — writes `~/.o9k/roster-scores.json`, prints propose report.
3. `$ROSTER refresh --apply` — semiauto: auto-rewrites role chain heads when
   **score ≥ current + min_delta (default 2)** AND **blended cost does not
   rise**. Backs up `roster.json` first. `pin_head: true` on a role → skip.
4. Show the user the APPLY vs SKIP sections verbatim.
5. Hosted open-weight models (Hermes/OpenCode) are included; local Ollama is not.

## Manual-only

`$ROSTER propose` — report without writing.
`$ROSTER apply-scores` — apply gates using the last scores file (no re-fetch).

## Cron

Prefer `scripts/roster-refresh-cron.sh` (disk-first report). Register weekly
in Hermes/Overseer; do not invent a second polling path.
