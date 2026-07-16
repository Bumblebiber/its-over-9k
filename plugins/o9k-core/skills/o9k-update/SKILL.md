---
name: o9k-update
description: "Check installed o9k pillars and companion frameworks for updates, and apply the safe ones. Use when the user invokes /o9k-update, asks whether anything is out of date, or acts on the SessionStart 'updates available' notice."
---

# o9k-update — Keep the Stack Current

o9k checks its dependencies for updates automatically in the background (once per
`O9K_UPDATE_INTERVAL_HOURS`, default 24h) and mentions anything updatable at
session start. This skill is the on-demand and apply path.

## Check now (read-only)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/update-check.mjs" --report
```

Forces a fresh check (ignores the cache) and prints: each npm-global companion's
installed→latest version, whether the o9k repo itself is behind upstream, and the
exact commands to apply. Nothing is changed.

## Apply the safe updates

Only after showing the report and getting a yes (unless the user has already
opted into `O9K_UPDATE_CHECK=auto`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/update-check.mjs" --apply
```

**Scope: `--apply` only updates npm-global CLIs.** Host configs (Codex/Cursor/
OpenCode/Hermes hook wiring, skills) are touched only with `--refresh-hosts`
or `O9K_REFRESH_HOSTS=on` — every file `--refresh-hosts` writes gets a
`.o9k-bak` backup first. Opt in with `O9K_REFRESH_HOSTS=on` to also
**refresh multi-CLI skills + hooks** (`skills-sync` + `host-wire`) as part of
`--apply`, so Codex/Cursor/OpenCode/Hermes wrappers point at the current
marketplace scripts. It deliberately does **not** touch:

- **o9k plugins / the marketplace** — run `/plugin marketplace update o9k`
  instead (Claude Code manages that clone; a manual pull could clobber it).
  **After that marketplace update, always run:**
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/update-check.mjs" --refresh-hosts
  ```
  Claude picks up new plugin hooks via `CLAUDE_PLUGIN_ROOT`; other hosts need
  this re-bake because wrappers bake absolute paths and skills are copies.
- **Plugins like superpowers / Ponytail** — `/plugin` owns those.
- **git/uvx tools (Serena)** — already always-latest via `uvx`; npx-based MCPs
  (Context7) too. Nothing to pin.

Offer to run the `/plugin marketplace update` for the user when the report flags
the o9k repo as behind — and chain `--refresh-hosts` immediately after.

## Modes (tell the user, don't decide for them)

| `O9K_UPDATE_CHECK` | Behaviour |
|--------------------|-----------|
| `off` | No checking at all. |
| `notify` *(default)* | Background check; report updatable deps; apply nothing. |
| `auto` | Additionally auto-apply the safe npm-global updates in the background. |

If the user wants a different default, set it in their environment (e.g. shell
profile or Claude Code env). Auto mode never auto-updates plugins or the repo —
those stay notify-only by design.

## Presenting results

Apply caveman brevity. A clean report is one line ("everything up to date").
When updates exist, list them compactly and offer the apply — never dump the
raw script output verbatim if a one-line summary conveys it.
