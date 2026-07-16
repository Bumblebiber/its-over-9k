# its-over-9k (o9k)

> **What does the scouter say about his context level?**
> **IT'S OVER 9000!!!**

![It's Over 9000](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3h1MDJxbWE0MnU0Y3Y2cmc3Z3ZkOWdjaThwYzVqbTkwbHo1eWM1NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tPKoWQJk3cEbC/giphy.gif)

**o9k is a meta-framework for AI coding agents.** It doesn't invent yet another
technique — it *combines* the best token-efficiency and agent-quality frameworks
into one coherent, conflict-free system of skills and plugins, wired to a
persistent memory MCP. Primary packaging is a Claude Code marketplace; the same
pillars also wire into **Cursor, Codex, OpenCode, and Hermes** via `/o9k-init`.

Every framework below saves tokens or improves output on its own. Combined
naively, they fight each other — two plugins hooking `SessionStart`, two output
styles rewriting your prose, two "plans" claiming to be the source of truth.
o9k's job is the **arbitration layer**: each concern has exactly one owner, and
the pieces multiply instead of colliding.

---

## The Seven Pillars

| Pillar | Plugin | What it does | Standing on the shoulders of |
|--------|--------|--------------|------------------------------|
| **Doctrine & arbitration** | `o9k-core` | The rules of engagement: who owns which hook, which style, which plan. Loaded once, always on. | Anthropic context-engineering guidance |
| **Output compression** | `o9k-caveman` | Telegraphic output style: ~50–65% fewer output tokens, with automatic fallback to full prose for anything safety-critical. | [caveman](https://github.com/JuliusBrussee/caveman) (MIT) |
| **Context discipline** | `o9k-scout` | Load structure, not files: search before read, targeted line ranges, one canonical repo map per session. | aider repo-map, [codesight](https://github.com/Houseofmvps/codesight), [ast-grep](https://github.com/ast-grep/ast-grep) |
| **Subagent isolation** | `o9k-dispatch` | Cost-gated fan-out: offload searches and decomposable work to isolated subagents that return results, not transcripts. | [Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system), superpowers' dispatch skills |
| **Memory** | `o9k-memory` | A memory MCP so sessions never start from zero — compact briefing at session start, deep recall on demand, save-before-compact. | **[hmem](https://github.com/Bumblebiber/hmem)** (available default), [TIM](https://github.com/Bumblebiber/tim) (planned) |
| **Discovery** | `o9k-recon` | Find and classify companion frameworks; one-command companion bundle installs. | — |
| **Multi-agent roster** | `o9k-roster` | Role→CLI×model fallback chains (deterministic `pick`/`dispatch`/`handoff`), usage-limit watch + handoff protocol, optional OpenRouter/AA score refresh. See [docs/MULTI-AGENT.md](docs/MULTI-AGENT.md). | — |

Each pillar is an independent plugin. Install all seven or cherry-pick — `o9k-core`
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

## Zero effort by design

The human should not have to do — or know — anything. After install, a
SessionStart hook in `o9k-core` injects the doctrine automatically every
session: the agent compresses its output, loads only what it needs, offloads
noisy searches, and saves state before compaction — no commands, no reading,
no habits to learn.

What automation can't do (picking a dispatch owner when superpowers is also
installed, a one-time `hmem init`), the agent handles conversationally:
**`/o9k-init`** is the guided setup — it detects what's already on the
machine, asks which companion bundle you want, installs git if you're missing
it, and when something you already run collides with a bundle pick it explains
*why* the pick is better and migrates your data before uninstalling anything
(your call, either way). On the very first session the agent offers it
automatically, and **`/o9k-guide`** brings back a one-minute orientation any
time. The guide is personalized — it detects your actual setup and
mentions only what's missing, offering to fix each item for you. A fully set-up
install gets three sentences: *everything runs by itself, nothing to do,
`/o9k-stats` shows the effect.*

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
/plugin install o9k-roster@o9k
```

Then run **`/o9k-init`** in a session — it detects your setup, walks you
through the companion bundle choice, and handles conflicts and migration.

**Works with Claude Code, Codex, Cursor, OpenCode, and Hermes** on the same
machine: `/o9k-init` syncs shared o9k skills and wires session hooks on every
detected host (it never installs missing CLI binaries — see the
[`o9k-init` skill](plugins/o9k-core/skills/o9k-init/SKILL.md)).

Or set up the memory backend by hand. **hmem is the available default** today:

```bash
npm install -g hmem-mcp && hmem init
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
those. This matrix covers every **o9k-compatible companion** and how each pair
gets along:

- 🟢 **complement each other** — worth more together than apart
- ⚪ **don't touch** — no interaction, safe by construction
- ⚠️ **one rule needed** — works once you name a single owner (see notes)
- 🔴 **block each other** — same concern, never both active

| | o9k | [Ponytail](https://github.com/DietrichGebert/ponytail) | [Context7](https://github.com/upstash/context7) | [ccusage](https://github.com/ryoppippi/ccusage) | [superpowers](https://github.com/obra/superpowers) | [beads](https://github.com/steveyegge/beads) | [Serena](https://github.com/oraios/serena) | [ast-grep](https://github.com/ast-grep/ast-grep) | [hmem](https://github.com/Bumblebiber/hmem)/TIM | [task-master](https://github.com/eyaltoledano/claude-task-master) | [BMAD](https://github.com/bmad-code-org/BMAD-METHOD)·[spec-kit](https://github.com/github/spec-kit) |
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

1. **o9k × superpowers:** keep `o9k-dispatch` OR superpowers' dispatch skills —
   one dispatch owner.
2. **superpowers × beads/task-master:** a plan *store* beats plan *files* — the
   store owns plans, disable superpowers' plan markdown. One plan owner.
3. **plan stores × memory:** the store owns work items, memory owns
   lessons/decisions. Never track the same work in both.
4. **Grouped entries block each other too** — BMAD, spec-kit, and SuperClaude
   all claim the methodology spine; any two of them collide.

**Not in the matrix — replacements, not companions.** Some frameworks claim a
concern an o9k pillar owns; they never share a setup with o9k, so their pairings
are moot. Run them *instead of* the pillar they displace, or not at all:
[claude-mem](https://github.com/thedotmack/claude-mem) / [mem0](https://github.com/mem0ai/mem0)
(vs the memory backend), [Graphify](https://github.com/Graphify-Labs/graphify) /
[claude-context](https://github.com/zilliztech/claude-context) /
[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
(vs scout's overview), [token-optimizer-mcp](https://github.com/ooples/token-optimizer-mcp)
(vs caveman+scout).

Full per-framework notes and install mechanisms:
**[docs/COMBINING.md](docs/COMBINING.md)**. The same facts exist
machine-readable as a **compatibility layer**
(`plugins/o9k-core/compat/registry.json`): detection, arbitration, and the
export-first migration driver (`o9k-migrate.mjs`) are all registry-driven —
`/o9k-init` uses it to detect rivals, argue the trade-off, and migrate data
before anything is uninstalled.

## Scouting for new frameworks

The ecosystem moves weekly (9,000+ marketplace entries and climbing). `o9k-recon`
ships **`framework-scout`** — a GitHub Scout skill that tells the agent *where*
to hunt (Trending, Topics, the plugin directory, awesome-lists), *how* to score a
candidate (concern → stars → freshness → license → install mechanism), and *how*
to slot it into the matrix above (symbiotic / orthogonal / blocking) before
proposing a bundle or matrix update. See
[plugins/o9k-recon/skills/framework-scout/SKILL.md](plugins/o9k-recon/skills/framework-scout/SKILL.md).

## Status

Early but functional. Seven pillars; hooks and multi-CLI wiring ship for the
hosts above.

- **SessionStart (o9k-core)** — injects a ~70-token doctrine directive (never
  documentation) so all installed pillars apply automatically; flags open
  arbitrations; offers `/o9k-guide` once on the first session. Disable via
  `O9K_CORE_HOOK=off`.
- **SessionStart update check (o9k-core)** — reports which pillars/companions
  are updatable, instantly from a cache; the actual version check runs detached
  in the background (once per `O9K_UPDATE_INTERVAL_HOURS`, default 24h), so it
  never slows session start. `O9K_UPDATE_CHECK=notify` (default) reports;
  `auto` also applies the safe npm-global updates; `off` disables. Plugins and
  the marketplace are always notify-only — never clobbered. `/o9k-update
  --refresh-hosts` re-syncs multi-CLI skills/hooks after marketplace updates.
- **SessionStart (o9k-memory)** — detects the memory backend (TIM via
  `tim resolve-project`, else hmem) and injects a compact loading *directive*
  (never memory content). Stays silent if the backend's own hooks are already
  installed — one owner per concern. Disable via `O9K_MEMORY_HOOK=off`.
- **PreCompact (o9k-memory)** — fires the backend's checkpoint (`tim checkpoint`
  / `hmem checkpoint`) in the background before compaction summarizes the
  session away. Never blocks or delays compaction.
- **Limit watch (o9k-roster)** — reads `~/.o9k/usage.json` (no provider API
  calls) and warns / instructs handoff when a provider or CLI crosses
  `limits.handoff_at`. Wired on all hosts; model choice stays in
  `roster.mjs`, never in LLM reasoning.

`o9k-core` also ships **`/o9k-guide`** (personalized setup orientation backed by
a read-only detector script), **`/o9k-update`** (check pillars & companions for
newer versions and apply the safe ones), and **`/o9k-stats`**: a zero-dependency
analyzer over Claude Code's session transcripts — output share, cache hit
profile, avg output per turn — so the savings are measured, not vibes.

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
