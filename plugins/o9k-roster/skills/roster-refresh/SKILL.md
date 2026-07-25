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

Refresh updates **scores/prices** and may promote chain **heads** — it does not
fix burst-window exhaustion. When `pick`/`dispatch` fails because every Claude
model is skipped at `handoff_at_burst` (default 0.8 on `claude:5h` /
`claude:session`), the user must **curate role chains** with non-Claude
CLI×model pins in `roster.json` (see `roster` § Burst windows). No amount of
refresh replaces that config.

`cli_model` aliases and `clis.claude.cmd` flags (`--dangerously-skip-permissions`)
are manual config — refresh never touches them.

## Manual-only

`$ROSTER propose` — report without writing.
`$ROSTER apply-scores` — apply gates using the last scores file (no re-fetch).

## Cron

**Live trigger:** system crontab `0 10 * * 1` →
`~/.hermes/scripts/roster-refresh-wrapper.sh` (Hermes gateway often down;
same pattern as TIM watchdogs).

Hermes job id `e0c56515831c` exists but is **paused** (avoids double-fire).
Reports: `~/.hermes/cron-outputs/roster-refresh/`.

Manual: `bash ~/.hermes/scripts/roster-refresh-wrapper.sh`

## After apply

If APPLY rewrote a chain head, remind the user that `pin_head: true` on a role
freezes that head from future semiauto apply. Burst-window skips at dispatch time
are independent of score rank — check `roster usage --check` when dispatch
starts failing with "all models skipped".
