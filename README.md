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
| **Memory** | `o9k-memory` | A memory MCP so sessions never start from zero — compact briefing at session start, deep recall on demand, save-before-compact. | **[TIM](https://github.com/Bumblebiber/tim)** (recommended), [hmem](https://github.com/Bumblebiber/hmem) (stable alternative) |

Each pillar is an independent plugin. Install all five or cherry-pick — `o9k-core`
is the only one the others assume.

## Why combining multiplies

- **Less output → less context.** Everything the agent says gets fed back into
  every later turn. caveman-style output doesn't just save this turn's tokens —
  it shrinks every future turn and delays compaction.
- **Less context → better memory.** What scout refuses to load blindly never has
  to be summarized away. What dispatch isolates in a subagent never pollutes the
  main context. Compaction fires later, loses less.
- **Memory → less re-reading.** A 300-token briefing from TIM replaces the 20k
  tokens of "let me look around the codebase" that every fresh session burns.
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
```

Then set up the memory backend (recommended: TIM):

```bash
tim init          # see https://github.com/Bumblebiber/tim
```

or the stable alternative:

```bash
npm install -g hmem && npx hmem init
```

## Playing with others

o9k deliberately does **not** re-implement workflow methodology, issue tracking,
or symbol-level code navigation — excellent frameworks exist for those. See
[docs/COMBINING.md](docs/COMBINING.md) for tested combinations and the conflict
rules:

| Framework | Role in an o9k setup | Rule |
|-----------|----------------------|------|
| [superpowers](https://github.com/obra/superpowers) | Workflow discipline (brainstorm → plan → TDD → review) | Its skills own *process*; o9k owns *efficiency*. Disable its dispatch skills in favor of `o9k-dispatch` (or vice versa — pick one). |
| [beads](https://github.com/steveyegge/beads) | Task/plan offload to a dependency-aware issue graph | beads owns "the plan"; don't also keep plan markdown files in context. |
| [Serena](https://github.com/oraios/serena) | Symbol-level navigation & edits | Scout owns the *overview* map; Serena owns *symbol* ops. Never both for the same lookup. |

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
write-up. Memory by [TIM](https://github.com/Bumblebiber/tim) /
[hmem](https://github.com/Bumblebiber/hmem).

## License

MIT
