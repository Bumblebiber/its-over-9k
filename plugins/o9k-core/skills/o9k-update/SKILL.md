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
installed→latest version, both **o9k channels** (npm global package + git
marketplace clone), and the exact commands to apply. Nothing is changed.

## Apply the safe updates

Only after showing the report and getting a yes (unless the user has already
opted into `O9K_UPDATE_CHECK=auto`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/update-check.mjs" --apply
```

**Scope: `--apply` only updates npm-global CLIs** (including `its-over-9k`
when installed via `npm i -g its-over-9k`). Host configs (Codex/Cursor/
OpenCode/Hermes hook wiring, skills) are touched when:

- the **`its-over-9k` npm package** was just updated (auto-refresh — marketplace
  files on disk changed), or
- `O9K_REFRESH_HOSTS=on`, or
- you run `--refresh-hosts` separately.

Every file `--refresh-hosts` writes gets a `.o9k-bak` backup first.

It deliberately does **not** touch:

- **Claude marketplace plugins / git clone** — run `/plugin marketplace update o9k`
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

### Two o9k install channels

| Channel | How installed | Update path |
|---------|---------------|-------------|
| **npm** | `npm i -g its-over-9k` | `--apply` runs `npm i -g its-over-9k@latest`, then auto `--refresh-hosts` |
| **git marketplace** | `/plugin marketplace add Bumblebiber/its-over-9k` | `/plugin marketplace update o9k`, then `--refresh-hosts` |

Both may be present. Report both; never auto-update the Claude marketplace clone.
CLI shortcut when npm-installed: `o9k update` / `o9k update --apply`.

**Coming from `its-over-9k@1.x`?** That was the old hmem CLI. Clean reinstall:

```bash
npm uninstall -g its-over-9k
npm i -g hmem-mcp && hmem init
npm i -g its-over-9k@latest && o9k setup
```

Offer to run the `/plugin marketplace update` for the user when the report flags
the git clone as behind — and chain `--refresh-hosts` immediately after.

## Skill / host currency

`--report` and `--apply` now also check that every enabled pillar's skills are
wired to the actual hosts you use (Claude Code, Cursor, Codex, OpenCode,
Hermes). The check is a local fs walk — instant, no network.

Three drift cases, three remedies:

| Case | Signal | Fix |
|------|--------|-----|
| **New pillar** (enabled pillar has skills in the marketplace but none wired to any host yet) | `NEW PILLAR` in report | **Run `/o9k-init`** — not fixable with `--refresh-hosts` alone; new pillars need MCP arbitration, config files, and host wiring. |
| **Missing canonical** (existing pillar gained a new upstream skill; some skills wired, some not) | `skills missing canonical` in report | Run `--refresh-hosts` — copies the new skill into `~/.agents/skills/o9k/` and wires hosts. |
| **Missing links** (canonical skills exist but a host's symlink or Cursor rule is missing/wrong) | `skills missing links` in report | Run `--refresh-hosts` — re-syncs canonical skills + re-wires host hooks. |

Concrete example (2026-07-17): `o9k-roster` installed as a plugin; source skills
present under `plugins/o9k-roster/skills/` but NOT exposed under
`~/.claude/skills/` or `~/.agents/skills/o9k/`. Old `/o9k-update` saw nothing
wrong (npm companions current). Now `--report` flags it as **NEW PILLAR** →
recommends `/o9k-init`.

After a marketplace update (`/plugin marketplace update o9k`) or an npm bump
of `its-over-9k`, always ensure hosts are refreshed (npm path does this
automatically on `--apply`). The skill check here is a separate safety net —
it catches drift regardless of how the pillar arrived.

## Modes (tell the user, don't decide for them)

| `O9K_UPDATE_CHECK` | Behaviour |
|--------------------|-----------|
| `off` | No checking at all. |
| `notify` *(default)* | Background check; report updatable deps; apply nothing. |
| `auto` | Additionally auto-apply the safe npm-global updates in the background. |

If the user wants a different default, set it in their environment (e.g. shell
profile or Claude Code env). Auto mode never auto-updates Claude marketplace
plugins or the git clone — those stay notify-only by design.

## Presenting results

Apply caveman brevity. A clean report is one line ("everything up to date")
only when npm companions, o9k channels, **and** skills/host wiring are all current.
When updates or skills drift exist, list them compactly and offer the apply —
never dump the raw script output verbatim if a one-line summary conveys it.
