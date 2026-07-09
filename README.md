# its-over-9k (o9k)

> **What does the scouter say about his context level?**
> **IT'S OVER 9000!!!**

![It's Over 9000](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3h1MDJxbWE0MnU0Y3Y2cmc3Z3ZkOWdjaThwYzVqbTkwbHo1eWM1NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tPKoWQJk3cEbC/giphy.gif)

**o9k is a meta-framework for AI coding agents.** It doesn't invent yet another
technique — it *combines* the best token-efficiency and agent-quality frameworks
into one coherent, conflict-free system of Claude Code skills and plugins, wired
to a persistent memory MCP.

Every framework below saves tokens or improves output on its own. Combined
naively, they fight each other — two plugins hooking `SessionStart`, two output
styles rewriting your prose, two "plans" claiming to be the source of truth.
o9k's job is the **arbitration layer**: each concern has exactly one owner, and
the pieces multiply instead of colliding.

---

## The Five Pillars

| Pillar | Plugin | What it does | Standing on the shoulders of |
|--------|--------|--------------|------------------------------|
| **Doctrine & arbitration** | `o9k-core` | The rules of engagement: who owns which hook, which style, which plan. Loaded once, always on. | Anthropic context-engineering guidance |
| **Output compression** | `o9k-caveman` | Telegraphic output style: ~50–65% fewer output tokens, with automatic fallback to full prose for anything safety-critical. | [caveman](https://github.com/JuliusBrussee/caveman) (MIT) |
| **Context discipline** | `o9k-scout` | Load structure, not files: search before read, targeted line ranges, one canonical repo map per session. | aider repo-map, [codesight](https://github.com/Houseofmvps/codesight), [ast-grep](https://github.com/ast-grep/ast-grep) |
| **Subagent isolation** | `o9k-dispatch` | Cost-gated fan-out: offload searches and decomposable work to isolated subagents that return results, not transcripts. | [Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system), superpowers' dispatch skills |
| **Memory** | `o9k-memory` | A memory MCP so sessions never start from zero — compact briefing at session start, deep recall on demand, save-before-compact. | **[hmem](https://github.com/Bumblebiber/hmem)** (available default), [TIM](https://github.com/Bumblebiber/tim) (planned) |

Each pillar is an independent plugin. Install all five or cherry-pick — `o9k-core`
is the only one the others assume.

## Why combining multiplies

- **Less output → less context.** Everything the agent says gets fed back into
  every later turn. caveman-style output doesn't just save this turn's tokens —
  it shrinks every future turn and delays compaction.
- **Less context → better memory.** What scout refuses to load blindly never has
  to be summarized away. What dispatch isolates in a subagent never pollutes the
  main context. Compaction fires later, loses less.
- **Memory → less re-reading.** A 300-token briefing from the memory backend
  replaces the 20k tokens of "let me look around the codebase" that every fresh
  session burns.
- **Together:** the agent's *effective* context — the fraction doing useful
  work — goes way past what any single technique achieves. It's over 9000.

## Install

o9k is a [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces):

```
/plugin marketplace add Bumblebiber/its-over-9k
/plugin install o9k-core@o9k
/plugin install o9k-caveman@o9k
/plugin install o9k-scout@o9k
/plugin install o9k-dispatch@o9k
/plugin install o9k-memory@o9k
/plugin install o9k-recon@o9k
```

Then set up the memory backend. **hmem is the available default** today:

```bash
npm install -g hmem && npx hmem init
```

**TIM** is a planned backend — not yet published. Once it ships, `o9k-memory`
will auto-detect it (`tim resolve-project`) and prefer it; until then the hook
falls back to hmem automatically, so nothing to change. Track it at
[Bumblebiber/tim](https://github.com/Bumblebiber/tim).

### One command for the companions

Don't hand-install the third-party frameworks below. `o9k-recon` ships a
bundle installer that wires up a whole tested stack at once:

```
/plugin install o9k-recon@o9k
```

then run the `companion-bundles` skill (or `install/o9k-companions.sh
recommended --run`). Bundles: `minimal`, `recommended`, `max` — see
[docs/BUNDLES.md](docs/BUNDLES.md).

## Playing with others

o9k deliberately does **not** re-implement workflow methodology, issue tracking,
docs injection, or symbol-level navigation — excellent frameworks exist for
those. The compatibility question is always the same: **does this framework
claim a concern o9k already owns?** Three outcomes:

- 🟢 **Symbiotic** — occupies a concern o9k has no opinion on, or feeds a pillar.
  Install alongside; they multiply. (One-owner caveats noted.)
- ⚪ **Orthogonal** — never touches an o9k concern. Safe by construction.
- 🔴 **Blocking** — claims a concern a pillar owns. Run **one owner, never two**.

| Framework | Concern | Verdict | Rule |
|-----------|---------|:-------:|------|
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Code minimalism (YAGNI, smallest diff) | 🟢 | New axis — caveman shrinks *prose*, Ponytail shrinks the *diff* (~54% less code). Pure multiplier; o9k's closest cousin. |
| [Context7](https://github.com/upstash/context7) | Live library-docs injection | ⚪ | Pure add — o9k has no docs pillar. Best low-risk companion. |
| [ccusage](https://github.com/ryoppippi/ccusage) | Cost ($) reporting | ⚪ | Complements `/o9k-stats` (context share); different axis, no overlap. |
| [superpowers](https://github.com/obra/superpowers) | Workflow methodology | 🟢 | Owns *process*, o9k owns *efficiency*. Pick one dispatch owner (its skills or `o9k-dispatch`). |
| [beads](https://github.com/steveyegge/beads) | Task/plan graph | 🟢 | Owns "the plan"; keep plans out of memory & markdown. |
| [Serena](https://github.com/oraios/serena) | Symbol-level ops | 🟢 | Scout owns the *overview*, Serena owns *symbols*. Never both per lookup. |
| [ast-grep](https://github.com/ast-grep/ast-grep) · [repomix](https://github.com/yamadashy/repomix) · [codesight](https://github.com/Houseofmvps/codesight) | Structure extraction | 🟢 | Feed `scout` — but **one** overview builder per session. |
| [claude-mem](https://github.com/thedotmack/claude-mem) · [mem0](https://github.com/mem0ai/mem0) · TIM/hmem | Persistent memory | 🔴 | One memory MCP only — two = double injection, split-brain. |
| [Graphify](https://github.com/Graphify-Labs/graphify) · [claude-context](https://github.com/zilliztech/claude-context) · [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | Code knowledge-graph / semantic index | 🔴 | Overview builder — collides with scout's map and each other. Pick one. Graphify also hooks search calls toward its graph. |
| [token-optimizer-mcp](https://github.com/ooples/token-optimizer-mcp) | Output/tool compression | 🔴 | Overlaps `caveman` + `scout`. Treat as a *replacement* for those pillars, not an addition. |
| [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) · [spec-kit](https://github.com/github/spec-kit) · [task-master](https://github.com/eyaltoledano/claude-task-master) | Methodology / plan spine | 🔴 | One process owner and one plan owner — collide with superpowers/beads and each other. |

Full per-framework notes, install mechanisms, and the **pairwise framework ×
framework matrix** (every combination scored 🟢 ergänzen sich / ⚪ tangieren sich
nicht / ⚠️ mit Regel / 🔴 blockieren sich):
**[docs/COMBINING.md](docs/COMBINING.md)**.

## Scouting for new frameworks

The ecosystem moves weekly (9,000+ marketplace entries and climbing). `o9k-recon`
ships **`framework-scout`** — a GitHub Scout skill that tells the agent *where*
to hunt (Trending, Topics, the plugin directory, awesome-lists), *how* to score a
candidate (concern → stars → freshness → license → install mechanism), and *how*
to slot it into the matrix above (symbiotic / orthogonal / blocking) before
proposing a bundle or matrix update. See
[plugins/o9k-recon/skills/framework-scout/SKILL.md](plugins/o9k-recon/skills/framework-scout/SKILL.md).

## Status

Early but functional. `o9k-memory` ships real hook automation:

- **SessionStart** — detects the memory backend (TIM via `tim resolve-project`,
  else hmem) and injects a compact loading *directive* (never memory content).
  Stays silent if the backend's own hooks are already installed — one owner per
  concern. Disable via `O9K_MEMORY_HOOK=off`.
- **PreCompact** — fires the backend's checkpoint (`tim checkpoint` /
  `hmem checkpoint`) in the background before compaction summarizes the
  session away. Never blocks or delays compaction.

`o9k-core` ships `/o9k-stats`: a zero-dependency analyzer over Claude Code's
session transcripts — output share, cache hit profile, avg output per turn —
so the savings are measured, not vibes.

## Credits & prior art

o9k adapts ideas (and gives full credit) from: [caveman](https://github.com/JuliusBrussee/caveman)
by Julius Brussee (MIT), [superpowers](https://github.com/obra/superpowers) by
Jesse Vincent (MIT), [beads](https://github.com/steveyegge/beads) by Steve Yegge
(MIT), [aider's repo-map](https://aider.chat/docs/repomap.html),
[LLMLingua](https://github.com/microsoft/LLMLingua), and Anthropic's
[multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
write-up. Memory by [hmem](https://github.com/Bumblebiber/hmem) (with
[TIM](https://github.com/Bumblebiber/tim) planned). Compatibility research also
covers [Context7](https://github.com/upstash/context7),
[ccusage](https://github.com/ryoppippi/ccusage),
[claude-mem](https://github.com/thedotmack/claude-mem),
[claude-context](https://github.com/zilliztech/claude-context), and the
spec-driven crowd ([spec-kit](https://github.com/github/spec-kit),
[BMAD](https://github.com/bmad-code-org/BMAD-METHOD),
[task-master](https://github.com/eyaltoledano/claude-task-master)) — see
[docs/COMBINING.md](docs/COMBINING.md).

## License

MIT
