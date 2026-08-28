---
name: companion-bundles
description: "Install a conflict-free stack of third-party o9k companion frameworks in one command. MUST use when the user asks to set up companions, install the recommended stack, add memory/docs/methodology/symbol tools alongside o9k, or extend an existing bundle — never hand-install MCP servers without checking arbitration first. Wraps install/o9k-companions.sh and enforces the one-owner-per-concern rule from using-o9k."
---

# companion-bundles — one-command companion install

> **First install or unknown delta:** `/o9k-init` (o9k-core) — mandatory
> interview (detection, bundle choice, conflict migration, git). **Known bundle
> name** (`minimal` / `recommended` / `max`) → this skill directly.

o9k's pillars are Claude Code plugins. The *companions* (memory backend, live
docs, methodology, task graph, symbols) live in other ecosystems — npm, uvx,
MCP, other plugin marketplaces. This skill installs a **curated, internally
conflict-free** subset in one shot via `install/o9k-companions.sh`.

Each bundle is guaranteed conflict-free: **no two tools in it claim the same o9k
concern** (see [docs/COMBINING.md](../../../../docs/COMBINING.md) and
[using-o9k arbitration](../../o9k-core/skills/using-o9k/SKILL.md)).

## Bundles

| Bundle | Contents | For |
|--------|----------|-----|
| `minimal` | hmem (memory) · Context7 (docs) · Ponytail (code minimalism) | Any project. Zero-conflict foundation, biggest payoff per install. |
| `recommended` | minimal + superpowers (methodology) + beads (task graph) + Serena (symbols) | The tested full stack. |
| `max` | recommended + ast-grep (structural) + ccusage (cost) | Large/polyglot repos wanting every conflict-free companion. |

## How to run

1. **Dry-run first — mandatory.** Prints the plan and prerequisite check;
   executes nothing:
   ```bash
   install/o9k-companions.sh recommended
   ```
2. Review the plan with the user, then execute the shell-installable steps:
   ```bash
   install/o9k-companions.sh recommended --run
   ```
3. Install the plugin-based companions (superpowers, Ponytail) yourself —
   `claude plugin marketplace add <owner>/<repo>` and
   `claude plugin install <name>` are regular shell commands, not the
   `/plugin` REPL-only slash command. Then tell the user to run
   `/reload-plugins` once (that step genuinely can't run from a shell).
   Anything the printed plan flags as truly manual (e.g. beads has no
   npm/go/brew package to script against) stays with the user — point at
   the upstream repo, don't guess an install command.

## Arbitration (using-o9k)

Before adding anything beyond the bundle script, read the concern→owner table in
[using-o9k](../../o9k-core/skills/using-o9k/SKILL.md). One active owner per
concern — no exceptions.

**Dispatch:** `team-up` owns subagent isolation (its `dispatch` skill).
Superpowers contributes methodology only. If upstream superpowers still has
`dispatching-parallel-agents` enabled, **disable it** — two dispatch owners is
a 🔴 collision per using-o9k arbitration.

**Plan owner:** with beads, beads owns work items; see [BUNDLES.md](../../../../docs/BUNDLES.md)
and [COMBINING.md](../../../../docs/COMBINING.md) for plan-store rules.

**Memory:** TIM or hmem — one backend. Hooks pick TIM when both are present;
do not install a second memory MCP "for comparison" on the live config.

## Do not

- **Don't** add a second tool from any 🔴 row of the matrix (a second memory
  backend, a second overview builder like Graphify/claude-context, a second plan
  store). A bundle stays conflict-free only if you don't hand-add collisions.
- **Don't** run `--run` without showing the dry-run plan first — installs touch
  global npm and register MCP servers.
- **Don't** install an unknown companion without `framework-scout` scoring it
  first — bundle script only ships pre-vetted tools.

## Extending a bundle

Found a new companion via `framework-scout`? If it's 🟢 or ⚪ and doesn't
duplicate a concern already in the bundle, add a `step`/`manual` entry to
`install/o9k-companions.sh` and a row to [docs/BUNDLES.md](../../../../docs/BUNDLES.md).
Never add a 🔴 framework to a bundle. Combo promotion to `recommended` still
requires measured pass rates from the `bundle-bench` companion (own repo).
