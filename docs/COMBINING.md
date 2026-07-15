# Combining Frameworks Without Collisions

o9k is a meta-framework: it assumes you'll mix it with other tools. This page
lists the tested combinations, what each adds, and the conflict rules that keep
them from fighting. The general law (from `using-o9k`): **exactly one owner per
concern** — one output style, one SessionStart injector, one repo map, one plan,
one dispatch mechanism, one memory backend.

## The compatibility layer

Everything on this page also exists machine-readable:
**`plugins/o9k-core/compat/registry.json`** maps every framework to the
concern(s) it claims, how to detect it, which bundle it belongs to, and — for
rivals — why the bundle pick wins and which migration adapter applies. The
detection scripts (`detect.mjs`, `o9k-init.mjs`, `o9k-guide.mjs`, the
SessionStart hook) and the migration driver (`o9k-migrate.mjs`) all read that
registry; arbitration is computed generically (any *exclusive* concern with
two detected owners is flagged). This page is the human-readable rendering —
when adding a framework, update the registry **and** the matrix below.

## How to read a candidate

Every framework maps to one question: **which o9k concern does it claim?**

| Symbol | Class | Meaning | Action |
|:------:|-------|---------|--------|
| 🟢 | **Symbiotic** | Occupies a concern o9k has no pillar for, or feeds one. | Install alongside. Resolve any one-owner caveat once. |
| ⚪ | **Orthogonal** | Never touches an o9k concern. | Install freely — no interaction to manage. |
| 🔴 | **Blocking** | Claims a concern a pillar already owns. | Run **one owner, never two**. Disable the loser. |

The o9k concerns (from the arbitration table in `using-o9k`): output style ·
SessionStart injection · the overview map · symbol navigation · the plan · task
state · workflow methodology · subagent dispatch · memory backend.

## Recommended stack

| Layer | Tool | Notes |
|-------|------|-------|
| Efficiency doctrine | **o9k** (this repo) | The five pillars |
| Memory MCP | **[hmem](https://github.com/Bumblebiber/hmem)** | Available default. **[TIM](https://github.com/Bumblebiber/tim)** is planned (unreleased) — never run both. |
| Live docs | **[Context7](https://github.com/upstash/context7)** | Orthogonal, near-zero risk, high payoff |
| Workflow methodology | **[superpowers](https://github.com/obra/superpowers)** | Optional, excellent |
| Task/plan store | **[beads](https://github.com/steveyegge/beads)** | Optional, shines with multiple agents |
| Symbol navigation | **[Serena](https://github.com/oraios/serena)** | Optional, big repos |

Install the whole stack in one shot with `o9k-recon`'s bundle installer — see
[BUNDLES.md](BUNDLES.md).

> **Note on TIM.** TIM is not yet published. The `o9k-memory` SessionStart hook
> probes for it (`tim resolve-project`) and silently falls back to hmem when it's
> absent, so hmem is what actually runs today. When TIM ships, no config change
> is needed — the hook will detect and prefer it.

## Compatibility matrix

Verdict is relative to a **default o9k install** (all five pillars on).

| Framework | Concern it claims | vs o9k | Owner rule |
|-----------|-------------------|:------:|------------|
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Code minimalism (YAGNI / smallest diff) | 🟢 | New axis — o9k has no code-volume pillar. Composes with caveman. |
| [Context7](https://github.com/upstash/context7) | Live library-docs injection | ⚪ | None — o9k has no docs pillar. |
| [ccusage](https://github.com/ryoppippi/ccusage) | Cost ($) / usage reporting | ⚪ | Complements `/o9k-stats` (context share ≠ dollars). |
| pr-review / LSP / semgrep plugins | Review, code-intel, security | ⚪ | Different job entirely. |
| [firecrawl](https://github.com/firecrawl/firecrawl) | Web scrape/search MCP | ⚪ | Route its dumps through `dispatch`; keep conclusions only. |
| [superpowers](https://github.com/obra/superpowers) | Workflow methodology | 🟢 | Owns *process*; o9k owns *efficiency*. **One dispatch owner.** |
| [beads](https://github.com/steveyegge/beads) | Task/plan graph | 🟢 | Owns "the plan". Don't duplicate into memory or markdown. |
| [Serena](https://github.com/oraios/serena) | Symbol-level ops | 🟢 | Scout = overview, Serena = symbols. Never both per lookup. |
| [ast-grep](https://github.com/ast-grep/ast-grep) | Structural queries | 🟢 | Feeds scout. Not an overview builder — no conflict. |
| [codesight](https://github.com/Houseofmvps/codesight) · [repomix](https://github.com/yamadashy/repomix) · aider repo-map | Overview generation | 🟢🔴 | Feeds scout — but **one** overview builder per session. |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Persistent memory + SessionStart | 🔴 | Memory owner. Collides with hmem/TIM and injects at SessionStart. Pick one. |
| [mem0 / OpenMemory](https://github.com/mem0ai/mem0) | Persistent memory | 🔴 | Same — one memory backend only. |
| [memory-mcp](https://github.com/yuvalsuede/memory-mcp) | Persistent memory | 🔴 | Same. |
| [Graphify](https://github.com/Graphify-Labs/graphify) | Code knowledge-graph skill | 🔴 | Overview builder (graph) + hooks search calls. Collides with scout's map. Pick one. |
| [claude-context](https://github.com/zilliztech/claude-context) | Semantic code index | 🔴 | Overview builder (vector). Collides with scout's map. Pick one. |
| [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | Code knowledge graph | 🔴 | Overview builder (graph). Collides with scout's map. Pick one. |
| [tokenmax-mcp](https://github.com/justinjamesmathew/tokenmax-mcp) | Compressed symbol map | 🔴 | Overview builder + symbol view. Collides with scout **and** Serena. |
| [token-optimizer-mcp](https://github.com/ooples/token-optimizer-mcp) | Output + tool compression | 🔴 | Overlaps `caveman` + `scout`. Replacement, not addition. |
| [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) | Methodology + roles + plan | 🔴 | Methodology owner. Collides with superpowers *and* carries its own plan store. Pick one spine. |
| [spec-kit](https://github.com/github/spec-kit) | Spec-driven methodology | 🔴 | Methodology owner. One process spine. |
| [SuperClaude](https://github.com/SuperClaude-Org/SuperClaude_Framework) | Methodology + commands | 🔴 | Methodology owner. One process spine. |
| [task-master](https://github.com/eyaltoledano/claude-task-master) | Task/plan store | 🔴 | Plan owner. Collides with beads. Pick one. |

**Two conflicting frameworks can still coexist** if you demote one: run
Serena for symbols *and* claude-context off (or vice versa). The rule bans two
*active* owners of a concern, not two installed packages.

## Per-framework rules

### Symbiotic — install alongside o9k

**[Ponytail](https://github.com/DietrichGebert/ponytail) (DietrichGebert) — code
minimalism.** o9k's closest philosophical cousin, on a different axis. o9k trims
*context and prose*; Ponytail trims *the code the agent writes* — "the best code
is the code you never wrote," a YAGNI extremist that prefers stdlib/native, the
shortest diff, and the shortest explanation. Reported ~54% less code (up to 94%)
on real Claude Code sessions. **Why it composes, not collides:** `caveman` owns
*output style* (telegraphic prose); Ponytail owns *code volume* (smaller diffs).
They stack — and a smaller diff is also less to read back next turn, so it feeds
scout and delays compaction just like the pillars do. Agent-portable skill
(installs as a Claude Code skill/plugin). The one thing to keep straight: its
"shortest explanation" bias and `caveman` both touch prose — let `caveman` own
tone, let Ponytail own the code decision. Near-zero conflict; highest-alignment
companion o9k has.

**[Context7](https://github.com/upstash/context7) (upstash) — live docs.** MCP
that injects current, version-correct library documentation on demand. o9k has no
docs concern, so it's pure upside — and it *reinforces* scout: fetch the one API
signature you need instead of reading `node_modules`. Best first companion.

**[ccusage](https://github.com/ryoppippi/ccusage) (ryoppippi) — cost report.**
Reads Claude Code's JSONL to report tokens and dollars per model/day/project.
`/o9k-stats` measures *context share and cache profile* — a different axis.
Run both; they answer different questions.

**[superpowers](https://github.com/obra/superpowers) (obra) — methodology.** MIT.
Brainstorm → plan → TDD → debug → review → finish as Claude Code skills. o9k
doesn't cover methodology at all — perfect fit. **Two conflicts to resolve once:**
(1) it ships dispatch skills (`dispatching-parallel-agents`,
`subagent-driven-development`) — keep those or `o9k-dispatch`, disable the other;
(2) its plan files belong in beads if beads is installed.

**[beads](https://github.com/steveyegge/beads) (steveyegge) — task graph.** MIT.
Dependency-aware issue tracker (`bd` CLI + MCP). "The plan" leaves context
entirely; agents query only unblocked work. Multi-agent safe (hash IDs).
**Owner rule:** beads owns work items; memory (hmem/TIM) owns lessons, decisions,
errors. Don't cross the streams. Collides with task-master and superpowers plan
files.

**[Serena](https://github.com/oraios/serena) (oraios) — symbol ops.** MIT. LSP
MCP: `find_symbol`, `find_references`, symbol-level edits, 40+ languages. Replaces
grep-and-read-whole-file loops with one semantic call. **Owner rule:** scout owns
the overview map, Serena owns symbols — never both to answer the same question, or
you pay for two scans. Worth it on large repos; skip on small ones (LSP startup
overhead outweighs savings).

**Structure extractors — [ast-grep](https://github.com/ast-grep/ast-grep),
[codesight](https://github.com/Houseofmvps/codesight),
[repomix](https://github.com/yamadashy/repomix), aider repo-map.** Feed the scout
pillar. ast-grep answers structural queries (no overview conflict). The rest
*generate an overview* (`CONTEXT.md`, a packed repo digest) — scout's rule holds:
**one** overview per session, whichever tool builds it.

### Blocking — one owner, never two

**Memory backends — hmem, TIM, [claude-mem](https://github.com/thedotmack/claude-mem),
[mem0](https://github.com/mem0ai/mem0), [memory-mcp](https://github.com/yuvalsuede/memory-mcp).**
Each injects at SessionStart and holds persistent state. Two = double injection
and split-brain memory. Pick one; `o9k-memory` arbitrates by detecting the
backend and staying silent if the backend's own hook already fires. claude-mem is
notable for cross-agent capture/compress/inject, but it is still a *memory owner*
— it does not co-exist with hmem/TIM.

**Overview / code-index builders — scout's chosen tool vs
[Graphify](https://github.com/Graphify-Labs/graphify) (knowledge graph),
[claude-context](https://github.com/zilliztech/claude-context) (vector),
[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (graph),
[tokenmax-mcp](https://github.com/justinjamesmathew/tokenmax-mcp), Serena
onboarding, codesight.** All build a whole-repo model. Impressive token claims
(codebase-memory-mcp reports ~99% fewer tokens vs file-by-file grep), but they
are substitutes, not a stack. Scout's law: **one overview per session.** Choose
the builder, disable the rest. tokenmax additionally overlaps Serena (symbols).

**[Graphify](https://github.com/Graphify-Labs/graphify) (Graphify-Labs)** deserves
a specific note because it is more than a passive index: the `/graphify` skill
turns any folder — code, SQL schemas, scripts, docs, papers, even images/video —
into a queryable knowledge graph (`graph.json` + an HTML view + `GRAPH_REPORT.md`),
and it installs **hooks that nudge search-style tool calls toward the graph**. That
makes it a genuine *scout replacement*, not a companion: if you run Graphify, it —
not scout — owns the overview and the "how do I find things" path for the session.
Pick one. Where it shines: large, polyglot repos where the one-graph-for-everything
model beats scout's lightweight map; where it hurts: the graph build is an upfront
cost that a small repo never earns back (same trade-off as Serena's LSP startup).

**[token-optimizer-mcp](https://github.com/ooples/token-optimizer-mcp) (ooples).**
Claims 60–95% reduction via caching, compression, and tool replacement. That
overlaps two pillars at once — output compression (`caveman`) and tool/context
intelligence (`scout`). It's an *alternative architecture*, not a companion: run
it **instead of** those pillars, or not at all. Don't stack two output/tool
compressors.

**Methodology spines — superpowers vs
[BMAD](https://github.com/bmad-code-org/BMAD-METHOD) vs
[spec-kit](https://github.com/github/spec-kit) vs
[SuperClaude](https://github.com/SuperClaude-Org/SuperClaude_Framework).** All
own *process*. One process spine per project — they issue competing plans, phases,
and commands. BMAD and spec-kit also carry their own plan/spec store, so they
collide with beads/task-master too. Pick one methodology; if it has a plan store,
that store wins over beads (or disable it and keep beads).

**[task-master](https://github.com/eyaltoledano/claude-task-master).** Plan/task
store like beads. One plan owner — beads or task-master, not both.

### caveman (JuliusBrussee) — output compression
MIT. The original. `o9k-caveman` is an adaptation tuned to compose with the other
pillars (shared exception list, arbitration-aware). **Conflict:** installing BOTH
upstream caveman and `o9k-caveman` = two style owners. Pick one. Upstream's
`/caveman-stats` and `/caveman-compress` are usable alongside `o9k-caveman` if you
keep only its *skill* disabled.

### LLMLingua (Microsoft) — input compression
Research-grade prompt compression (up to 20×) via a small scoring model. No Claude
Code integration; only relevant in a custom preprocessing pipeline. o9k's stance:
not loading irrelevant context (scout) beats compressing it after the fact —
revisit if a turnkey MCP wrapper appears.

## Known-bad combinations

- **Two memory MCPs** (hmem + TIM, or either + claude-mem / mem0 / memory-mcp):
  double SessionStart injection, split-brain state. One only.
- **Two output/tool compressors** (o9k-caveman + upstream caveman;
  o9k-caveman/scout + token-optimizer-mcp).
- **Two+ overview builders** (scout's map + Graphify + claude-context +
  codebase-memory-mcp + Serena onboarding + codesight) on the same repo in the
  same session.
- **Two methodology spines** (superpowers + BMAD, or + spec-kit, or + SuperClaude).
- **Two plan stores** (beads + task-master; or either + a methodology's own plan
  store + memory Next-Steps) all tracking the same work.
- **tokenmax + Serena** both answering symbol questions — one owner.

## Pairwise compatibility matrix

Every cell answers: *what happens if you run BOTH of these?* The matrix is
symmetric; the diagonal is —. It lists only **o9k-compatible companions** —
frameworks that block an o9k pillar outright (claude-mem/mem0, Graphify,
claude-context/codebase-memory-mcp/tokenmax, token-optimizer-mcp) never share a
setup with o9k, so their pairings are moot; they're covered as *replacements* in
the blocking section above.

- 🟢 **complement each other** — worth more together than apart
- ⚪ **don't touch** — no interaction, safe by construction
- ⚠️ **one rule needed** — works once you name a single owner (see notes)
- 🔴 **block each other** — same concern, never both active

| | o9k | Ponytail | Context7 | ccusage | superpowers | beads | Serena | ast-grep | hmem/TIM | task-master | BMAD·spec-kit·SC |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **o9k** | — | 🟢 | 🟢 | ⚪ | ⚠️¹ | 🟢 | 🟢 | 🟢 | 🟢 | ⚪ | ⚪ |
| **Ponytail** | 🟢 | — | 🟢 | ⚪ | 🟢 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ |
| **Context7** | 🟢 | 🟢 | — | ⚪ | 🟢 | ⚪ | 🟢 | ⚪ | ⚪ | ⚪ | ⚪ |
| **ccusage** | ⚪ | ⚪ | ⚪ | — | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ |
| **superpowers** | ⚠️¹ | 🟢 | 🟢 | ⚪ | — | ⚠️² | ⚪ | ⚪ | ⚪ | ⚠️² | 🔴 |
| **beads** | 🟢 | ⚪ | ⚪ | ⚪ | ⚠️² | — | ⚪ | ⚪ | ⚠️³ | 🔴 | 🔴 |
| **Serena** | 🟢 | ⚪ | 🟢 | ⚪ | ⚪ | ⚪ | — | ⚪ | ⚪ | ⚪ | ⚪ |
| **ast-grep** | 🟢 | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | — | ⚪ | ⚪ | ⚪ |
| **hmem/TIM** | 🟢 | ⚪ | ⚪ | ⚪ | ⚪ | ⚠️³ | ⚪ | ⚪ | — | ⚠️³ | ⚪ |
| **task-master** | ⚪ | ⚪ | ⚪ | ⚪ | ⚠️² | 🔴 | ⚪ | ⚪ | ⚠️³ | — | 🔴 |
| **BMAD·spec-kit·SuperClaude** | ⚪ | ⚪ | ⚪ | ⚪ | 🔴 | 🔴 | ⚪ | ⚪ | ⚪ | 🔴 | —⁴ |

**Notes:**

1. **o9k × superpowers** — great pair, ONE arbitration: keep `o9k-dispatch` OR
   superpowers' dispatch skills, disable the other.
2. **superpowers × beads/task-master** — superpowers writes plan *files*; if a
   plan *store* is installed, the store owns plans and superpowers' files are
   disabled. One plan owner.
3. **beads/task-master × memory backends** — coexist fine with the
   don't-cross-the-streams rule: the plan store owns work items, memory owns
   lessons/decisions/errors. Never track the same work in both.
4. **Grouped entries block each other too** — BMAD, spec-kit, and SuperClaude
   all claim the methodology spine; any two of them collide.

Notable 🟢 pairs beyond o9k: **Ponytail × superpowers** (methodology decides
*what* to build, Ponytail keeps it minimal), **Context7 × superpowers**
(current docs during the plan phase), **Context7 × Serena** (external API docs +
internal symbol truth), **Context7 × Ponytail** (docs make the stdlib-first
choice findable).
