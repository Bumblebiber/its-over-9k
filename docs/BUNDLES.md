# Companion Bundles

o9k's five pillars are Claude Code plugins you install from this marketplace. The
*companions* — memory, docs, methodology, task graph, symbols — live in other
ecosystems (npm, uvx, MCP, other plugin marketplaces). Rather than hand-install
each, `o9k-recon` ships a one-command installer that wires up a **conflict-free**
stack.

> **Conflict-free by construction.** Every bundle is curated so that **no two
> tools in it claim the same o9k concern** (memory, overview, output, plan,
> methodology, dispatch — see [COMBINING.md](COMBINING.md)). The pieces multiply
> instead of colliding. That's the whole thesis.

## Quick start

```
/plugin install o9k-recon@o9k          # once
```

Then, from the repo root:

```bash
install/o9k-companions.sh recommended         # dry run — prints the plan
install/o9k-companions.sh recommended --run   # execute shell-installable steps
```

The installer is a **dry run by default**. `--run` executes only the steps a
shell can do (npm / uvx / `claude mcp add`); in-session `/plugin` installs and
any ambiguous CLI are always printed as manual steps for you to run.

## The bundles

### `minimal` — zero-conflict foundation
The three highest-payoff, lowest-risk companions. Good on any project.

| Tool | Concern | Why it's safe |
|------|---------|---------------|
| [hmem](https://github.com/Bumblebiber/hmem) | Memory MCP | The available default backend (TIM is planned). One memory owner. |
| [Context7](https://github.com/upstash/context7) | Live docs | Orthogonal — o9k has no docs pillar. |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Code minimalism | New axis — trims the *diff*; caveman trims the *prose*. They stack. |

### `recommended` — the tested full stack
`minimal` plus the three optional-but-excellent companions, each owning a
distinct concern.

| Added tool | Concern | One-owner note |
|------------|---------|----------------|
| [superpowers](https://github.com/obra/superpowers) | Workflow methodology | `o9k-dispatch` owns dispatch; disable `dispatching-parallel-agents` if still on. |
| [beads](https://github.com/steveyegge/beads) | Task/plan graph | Owns "the plan" — keep it out of memory/markdown. |
| [Serena](https://github.com/oraios/serena) | Symbol ops | Scout owns overview; Serena owns symbols. |

### `max` — every conflict-free companion
`recommended` plus tools that touch concerns o9k has no pillar for, or feed one.

| Added tool | Concern | Note |
|------------|---------|------|
| [ast-grep](https://github.com/ast-grep/ast-grep) | Structural queries | Feeds scout — not an overview builder, so no conflict. |
| [ccusage](https://github.com/ryoppippi/ccusage) | Cost ($) reporting | Complements `/o9k-stats` (context share ≠ dollars). |

## Companion notes (`recommended` / `max`)

**Dispatch:** `o9k-dispatch` owns subagent isolation in every o9k stack (native
`dispatch` skill). Superpowers contributes *methodology* only. If upstream
superpowers still has `dispatching-parallel-agents` enabled, disable it — running
both re-introduces the collision o9k exists to prevent.

**Plan owner:** with beads installed, beads owns work items; keep superpowers
plan markdown out of the plan store's lane (see [COMBINING.md](COMBINING.md)).

## What is deliberately NOT in any bundle

Bundles never include two tools from the same 🔴 row of the matrix. Excluded by
design (pick at most one, yourself):

- **Second memory backend** — claude-mem, mem0, memory-mcp (hmem is in the bundle).
- **Overview builders** — [Graphify](https://github.com/Graphify-Labs/graphify),
  claude-context, codebase-memory-mcp, tokenmax. These *replace* scout's map;
  adding one is a deliberate architecture choice, not a bundle add.
- **Alternative all-in-one optimizers** — token-optimizer-mcp (replaces
  caveman+scout).
- **Alternative methodology spines** — BMAD, spec-kit, SuperClaude (superpowers is
  the bundle's spine).

To adopt one of these, swap it in and disable the pillar/companion it displaces —
see [COMBINING.md](COMBINING.md).

## Adding to a bundle

Use the `framework-scout` skill to vet a candidate. If it's 🟢 or ⚪ and doesn't
duplicate a concern already in the bundle, add a step to
`install/o9k-companions.sh` and a row here. Never add a 🔴 framework.
