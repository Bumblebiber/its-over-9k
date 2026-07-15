---
name: companion-bundles
description: "Install a conflict-free stack of third-party o9k companion frameworks in one command. Use when the user asks to set up companions, install the recommended stack, or add memory/docs/methodology/symbol tools alongside o9k. Wraps install/o9k-companions.sh and enforces the one-owner-per-concern rule."
---

# companion-bundles — one-command companion install

> **Guided flow available:** `/o9k-init` (o9k-core) wraps this skill in a full
> interview — detection, bundle choice as a delta, conflict resolution with
> migration, git setup. Prefer it for first installs; use this skill directly
> when the user already knows which bundle they want.

o9k's pillars are Claude Code plugins. The *companions* (memory backend, live
docs, methodology, task graph, symbols) live in other ecosystems — npm, uvx,
MCP, other plugin marketplaces. This skill installs a **curated, internally
conflict-free** subset in one shot via `install/o9k-companions.sh`.

Each bundle is guaranteed conflict-free: **no two tools in it claim the same o9k
concern** (see [docs/COMBINING.md](../../../../docs/COMBINING.md)).

## Bundles

| Bundle | Contents | For |
|--------|----------|-----|
| `minimal` | hmem (memory) · Context7 (docs) · Ponytail (code minimalism) | Any project. Zero-conflict foundation, biggest payoff per install. |
| `recommended` | minimal + superpowers (methodology) + beads (task graph) + Serena (symbols) | The tested full stack. |
| `max` | recommended + ast-grep (structural) + ccusage (cost) | Large/polyglot repos wanting every conflict-free companion. |

## How to run

1. Always **dry-run first** — it prints the plan and prerequisite check, executes
   nothing:
   ```bash
   install/o9k-companions.sh recommended
   ```
2. Review the plan with the user, then execute the shell-installable steps:
   ```bash
   install/o9k-companions.sh recommended --run
   ```
3. Do the **manual** steps it prints — the in-session `/plugin ...` installs
   (superpowers, Ponytail) and any CLI it flagged as manual (beads). These can't
   run from a shell.

## The one arbitration you must resolve

`recommended` and `max` include **superpowers**, which ships its own dispatch
skills. o9k also ships `o9k-dispatch`. **Pick one dispatch owner and disable the
other** — running both re-introduces exactly the collision o9k exists to prevent.
Everything else in the bundles is a distinct concern and needs no arbitration.

## Do not

- **Don't** add a second tool from any 🔴 row of the matrix (a second memory
  backend, a second overview builder like Graphify/claude-context, a second plan
  store). A bundle stays conflict-free only if you don't hand-add collisions.
- **Don't** run `--run` without showing the dry-run plan first — installs touch
  global npm and register MCP servers.

## Extending a bundle

Found a new companion via `framework-scout`? If it's 🟢 or ⚪ and doesn't
duplicate a concern already in the bundle, add a `step`/`manual` entry to
`install/o9k-companions.sh` and a row to [docs/BUNDLES.md](../../../../docs/BUNDLES.md).
Never add a 🔴 framework to a bundle.
