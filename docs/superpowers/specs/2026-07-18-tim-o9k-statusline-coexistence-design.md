# TIM ↔ o9k Statusline Coexistence — Detect & Defer

**Date:** 2026-07-18
**Status:** Approved (decisions locked)
**Depends on:** `docs/superpowers/specs/2026-07-18-o9k-statusline-design.md`
**Owner of migration UX:** `/o9k-init` (o9k-core)
**Related TIM follow-up:** stop auto-wiring host statuslines when o9k is present (separate TIM change)

## Problem

o9k now owns the cross-CLI statusline (opt-in via `/o9k-init`). TIM still ships its own host wiring (`statusLine` → TIM scripts, Hermes `_get_tim_status` / `tim-hermes-statusline.sh`). Users with both stacks risk:

- Double bars / conflicting `statusLine.command`
- Silent overwrite of TIM’s bar by o9k (or the reverse on TIM setup)
- TIM-only users losing a working statusline if TIM drops install entirely

## Decisions (locked 2026-07-18)

1. **Approach A — Detect & defer.** TIM remains the **segment backend** (`tim statusline` CLI). o9k owns **host orchestration**. TIM must not auto-wire hosts when o9k is present (TIM-side follow-up). Explicit TIM setup commands stay for TIM-only.
2. **Migration UX lives in `/o9k-init`**, not in TIM doctor/setup as the primary path.
3. **Never silently remove** a TIM statusline outside this Init branch.
4. **Default when user opts into o9k statusline and TIM bar is detected:** offer **remove TIM wiring** (recommended), with keep / abort alternatives.

## Ownership split

| Layer | TIM | o9k |
|-------|-----|-----|
| Render / data | `tim statusline` (text + `--format hermes`) | Segments call TIM; compose line |
| Host wire (Claude / Cursor / Hermes) | Explicit only for TIM-only (`setup-hermes-statusline`, manual Claude settings) | `/o9k-init` opt-in + `wire-all` |
| Detect foreign TIM bar | — | Init detect + migrate interview |
| Auto-wire on agent setup | Skip when o9k present (TIM follow-up) | Never outside Init |

## Detection (o9k-init)

Treat as **TIM-owned statusline** when any of:

**Claude / Cursor**

- `statusLine.command` (or equivalent) contains a TIM marker, e.g. `tim-statusline`, `tim statusline`, path under `tim-hooks`, or `packages/tim-hooks/scripts/tim-statusline`.

**Hermes**

- `~/.hermes/hermes-agent/cli.py` contains `_get_tim_status`, and/or
- `~/.hermes/agent-hooks/tim-hermes-statusline.sh` exists.

Detection is best-effort and read-only until the user chooses an action.

## Init interview flow

After host detect, in the existing **Statusline (opt-in, default Skip)** step:

```
Statusline question (default Skip)
        │
        ├─ Skip
        │     └─ If TIM bar detected: leave it alone (no prompt required;
        │        optional one-line note: "TIM statusline still active").
        │
        └─ Yes → element checklist (preselect `tim` when TIM bar or TIM CLI present)
              │
              └─ If TIM bar detected:
                    Ask (single choice):
                    A. Remove TIM host wiring, install o9k  (default / recommend)
                    B. Keep TIM wiring and also install o9k (warn: possible double bar)
                    C. Abort o9k statusline — leave TIM as-is
```

### Action A — Remove TIM, wire o9k

1. Backup host configs / `cli.py` via existing `.o9k-bak` contract.
2. Strip **only TIM-owned** markers:
   - Claude/Cursor: clear `statusLine` iff command matches TIM markers (not arbitrary foreign).
   - Hermes: remove `_get_tim_status` block / TIM prefix if present; remove `tim-hermes-statusline.sh` only if TIM-owned (do not touch o9k Hermes script).
3. Write `~/.o9k/statusline.json` and run `wire-all` as today.
4. Ensure `elements` includes `tim` unless the user deselected it.

### Action B — Keep TIM + o9k

- Wire o9k as usual **without** stripping TIM.
- Loud warning that Claude/Cursor can only have one `statusLine.command` — “keep TIM” on those hosts means **skip o9k wire for that host** (mode `keep`), while Hermes may stack prefixes if both patches exist (document risk).
- Practical rule for Claude/Cursor under B: treat like statusline collision keep — do not overwrite TIM command; report host as skipped for o9k wire.

### Action C — Abort

- Do not write o9k statusline config; do not call `wire-all`.

## Hard rules

- No TIM strip from `refresh-hosts`, SessionStart, marketplace enable, or `o9k-uninstall` of unrelated pillars.
- `o9k-uninstall` of o9k statusline does **not** reinstall TIM bar; print hint to run TIM setup if desired.
- Doctor: if o9k statusline enabled and Claude/Cursor still point at TIM markers → problem (“TIM statusline still wired; re-run /o9k-init migrate or remove manually”).

## TIM follow-up (out of scope for this o9k change, tracked)

1. `setup-agent` / auto Hermes statusline: if `~/.o9k/` exists or o9k marketplace present → skip auto-wire; print pointer to `/o9k-init`.
2. Keep `tim statusline` and `tim setup-hermes-statusline` documented for TIM-only.
3. Changelog: “Host statusline auto-install defers to o9k when present.”

## Non-goals

- Deleting `tim statusline` CLI or Hermes JSON formatter.
- Forcing all TIM users onto o9k.
- Chaining TIM command inside o9k renderer (o9k already consumes TIM via the `tim` segment).
- Auto-migrate on o9k plugin update.

## Tests (o9k)

Hermetic fixtures:

- Detect TIM Claude command → true; foreign command → false; o9k command → false (not TIM).
- Init path A: TIM settings stripped + o9k wired; `.o9k-bak` present.
- Init path B on Claude: TIM command preserved; o9k wire skipped for that host.
- Init Skip: TIM untouched.
- Doctor flags TIM command while o9k statusline enabled.

## Open points (non-blocking)

1. Exact TIM marker regex list — finalize in implementation against real install paths (`tim-statusline.sh`, npm global paths, etc.).
2. Whether Hermes Action B should refuse stacking and force A/C — default allow stack with warning unless spike shows TUI breakage.
