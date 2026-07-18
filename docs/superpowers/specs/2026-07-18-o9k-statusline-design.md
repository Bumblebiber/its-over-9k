# o9k Statusline — Opt-in, Selectable Elements, Host Translation

**Date:** 2026-07-18
**Status:** Draft (awaiting user review of this file)
**Home:** `plugins/o9k-core/scripts/statusline/` (Approach 1 — not a new pillar)
**Related:** `docs/superpowers/specs/2026-07-16-o9k-init-multi-cli-design.md`, host `wire-*.mjs` adapters

## Problem

Users want a shared o9k statusline that can show TIM, device, subscription
limits, context %, model, and git/worktree — across coding CLIs. Today:

- There is **no** o9k-owned statusline in this repo.
- TIM and hmem each have their own statusline paths; Claude/Cursor use a
  host `statusLine.command`, Hermes uses a TUI bar + patch.
- Auto-wiring a statusline without asking fights existing custom setups and
  surprises users on install/refresh.

## Decisions (locked 2026-07-18)

1. **Product = C.** One o9k statusline; TIM / usage / roster / host fields are
   **selectable elements**, not separate products.
2. **Install = A.** Only via `/o9k-init` (and Reconfigure). Default = **skip**.
   Never wire from marketplace install, SessionStart, or `--refresh-hosts`.
3. **Hosts = C.** Claude Code + Cursor + Hermes in scope; Codex / OpenCode wire
   when a real API exists, otherwise Init prints `statusline: unsupported` and
   skips — no silent half-wire.
4. **Collision = B.** If a host already has a statusline: ask keep vs replace.
   Replace takes a rolling backup (`.o9k-bak`), same contract as other host wires.
5. **Elements v1:** `tim`, `device`, `limits`, `context`, `model`, `git`.
6. **Overflow:** Prefer per-element priority truncate + optional marquee for
   long keys (`git`, `tim`); if marquee proves unreliable on a host, fall back
   to hard truncate. Missing backend data → **placeholders** (`tim:—`, …), not
   silent omission.
7. **Architecture = Approach 1.** Config + renderer in o9k-core; per-host wire
   adapters as the CLI translation layer. Not a new marketplace pillar.

## Solution overview

```
/o9k-init (opt-in)
  → ~/.o9k/statusline.json
  → wireStatusline(present hosts)

Host invokes command on refresh
  → o9k-statusline.mjs
       stdin JSON (host-specific or empty)
       → normalize(host) → canonical
       → segments from config
       → render (priority trim + marquee)
       → one line stdout
```

```
plugins/o9k-core/scripts/statusline/
  o9k-statusline.mjs      # CLI entry (stdin → stdout)
  normalize.mjs           # host payload → canonical
  render.mjs              # config + segments → line
  config.mjs              # read/write ~/.o9k/statusline.json
  marquee.mjs             # ~/.o9k/statusline-marquee.json offsets
  segments/
    tim.mjs
    device.mjs
    limits.mjs
    context.mjs
    model.mjs
    git.mjs
  wire-claude.mjs
  wire-cursor.mjs
  wire-hermes.mjs
  wire-codex.mjs          # detect; wire or unsupported
  wire-opencode.mjs       # detect; wire or unsupported
  wire-all.mjs            # orchestrate from init
```

Init skill gains an interview step after host detect; `o9k-init.mjs` stays
detection-only (or gains a non-interactive `--statusline-plan` later) —
agent asks, then runs wire with explicit flags.

## Config (`~/.o9k/statusline.json`)

Written only when the user opts in.

```json
{
  "version": 1,
  "enabled": true,
  "elements": ["tim", "device", "limits", "context", "model", "git"],
  "priority": ["limits", "tim", "context", "model", "device", "git"],
  "marquee": { "enabled": true, "keys": ["git", "tim"] },
  "hosts": { "claude": true, "cursor": true, "hermes": true }
}
```

| Field | Meaning |
|-------|---------|
| `elements` | Display order (left → right) |
| `priority` | Keep-priority **high → low**: `priority[0]` is shrunk/dropped **last**; the last entry is shrunk first |
| `marquee.keys` | Segments allowed to scroll within their budget slot |
| `hosts` | Which present hosts Init was told to wire |

### Elements

| Key | Content | Source | Empty |
|-----|---------|--------|-------|
| `tim` | Project · O-node · exchange counter | TIM CLI (`tim statusline` or equivalent) | `tim:—` |
| `device` | Active device | TIM I-entry / o9k device marker | `dev:—` |
| `limits` | Active-CLI 5h / week usage | `~/.o9k/usage.json` (roster collector) | `lim:—` |
| `context` | Context window % | Canonical from host payload | `ctx:—` |
| `model` | Model display name | Canonical from host payload | `mdl:—` |
| `git` | Branch and/or worktree | `git` + payload worktree | `git:—` |

## Canonical payload

Host adapters normalize to:

```json
{
  "host": "claude|cursor|hermes|codex|opencode|unknown",
  "cwd": "/path",
  "width": 120,
  "model": { "id": "...", "display_name": "..." },
  "context": { "used_percentage": 34.5, "remaining_percentage": 65.5 },
  "worktree": { "name": "...", "path": "..." }
}
```

Missing fields stay `null`; segments emit placeholders. Unknown / empty stdin
is valid (Hermes may call with no Claude-style JSON).

## Overflow algorithm

1. Render each enabled element to a raw string (or placeholder).
2. Budget = `canonical.width` (fallback `80`).
3. While joined length > budget: shrink or drop the **lowest keep-priority**
   element (last in `priority[]`) that still exceeds its minimum width
   (middle ellipsis when shrinking). Default: `git` goes first, `limits` last.
4. For keys in `marquee.keys`: if the segment still overflows its slot (or the
   line remains over budget after priority passes), advance a per-key offset
   stored in `~/.o9k/statusline-marquee.json` (one step per invocation).
5. If marquee state I/O fails or the host does not re-invoke often enough for
   readable motion → behave as hard truncate (decision 6 fallback).

Separator between segments: ` · ` (middle dot + spaces). Plain text default;
no required ANSI.

## Init interview

After host detection, **only** in `/o9k-init` / Reconfigure:

1. “Set up o9k statusline?” — default **No / Skip**.
2. If Yes → multi-select elements (at least one).
3. For each **present** host that already has a non-o9k statusline command:
   keep vs replace (backup on replace).
4. Wire only hosts with `hosts[h]=true` and a supported adapter.
5. Unsupported → explicit report line, no config mutation on that host.

### Hard rules

- `refreshHosts` / SessionStart / plugin enable **must not** call statusline wire.
- `enabled: false` or missing config file → renderer prints empty line / no-op
  and wires must not be present (doctor may flag orphans).

## Host translation

| Host | Wire target | Notes |
|------|-------------|-------|
| Claude Code | `~/.claude/settings.json` → `statusLine` | `type: command`, command → o9k entry |
| Cursor | `~/.cursor/cli-config.json` → `statusLine` | Align with Cursor statusline skill |
| Hermes | TUI status bar hook / programmatic patch | Pattern inspired by TIM Hermes statusline; **o9k-owned** script |
| Codex | TBD detect | Wire if documented hook exists; else unsupported |
| OpenCode | TBD detect | Same |

All wired commands point at the **same** `o9k-statusline.mjs` entry (thin
shell wrapper allowed for `bash` hosts). Windows: follow existing
`shell: powershell` pattern where Claude requires it.

## Doctor / Uninstall

- **Doctor:** If `statusline.json` has `enabled: true`, verify wired hosts
  point at o9k; flag foreign or dangling commands.
- **Uninstall:** Remove o9k `statusLine` entries only when the command is
  o9k-owned. Do **not** auto-restore `.o9k-bak`; print path for manual restore.
  Leave `~/.o9k/statusline.json` unless full uninstall of user state is requested
  (follow existing uninstall policy for `~/.o9k/`).

## Tests (hermetic)

- `normalize`: fixtures for Claude / Cursor / Hermes / empty → canonical
- `render`: priority truncate, placeholders, marquee offset step
- `wire-*`: temp `HOME`, replace+backup, keep leaves foreign command, unsupported
  returns structured skip
- Init skill text: documents opt-in default skip + no refresh-hosts wiring

## Non-goals (v1)

- New marketplace pillar `o9k-statusline`
- Auto-install on update or host refresh
- Standalone reconfigure CLI beyond Init (hand-edit config + re-run Init OK)
- Rich theme / color engine
- Windows-native Hermes patch requirement (WSL or unsupported is fine)
- Chaining / wrapping a previous foreign statusline command (replace or keep only)

## Open points (non-blocking for v1 plan)

1. Exact Hermes patch strategy (reuse TIM installer patterns vs minimal o9k
   patch) — resolve during implementation spike.
2. Codex/OpenCode: confirm whether any statusline-equivalent API exists at
   implement time; otherwise ship as unsupported.
3. Whether `o9k-init.mjs` gains `--wire-statusline` flags in the same PR as
   the skill text, or skill shells out to `wire-all.mjs` only.
