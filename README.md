# its-over-9k (o9k)

> **What does the scouter say about his context level?**
> **IT'S OVER 9000!!!**

![It's Over 9000](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3h1MDJxbWE0MnU0Y3Y2cmc3Z3ZkOWdjaThwYzVqbTkwbHo1eWM1NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tPKoWQJk3cEbC/giphy.gif)

**o9k is the connector between AI coding agent frameworks.** It invents no
technique of its own. It decides which installed framework owns which concern,
wires them into every host, and keeps their interplay efficient. Primary
packaging is a Claude Code marketplace; the same pillars also wire into
**Cursor, Codex, OpenCode, and Hermes** via `/o9k-init`.

Every framework below saves tokens or improves output on its own. Combined
naively, they fight each other — two plugins hooking `SessionStart`, two output
styles rewriting your prose, two "plans" claiming to be the source of truth.
o9k's job is the **arbitration layer**: each concern has exactly one owner, and
the pieces multiply instead of colliding.

**Everything is opt-in.** `o9k-core` is the connector itself and the only piece
the others assume. Every other pillar is a separate yes/no in `/o9k-init`, with
a plain statement of who it's for and who should skip it. A machine running
core plus one pillar is a correct install, not a partial one.

---

## The pillars

`o9k-core` is required. The rest are opt-in — `/o9k-init` asks about each one
separately and defaults to **no**.

| Pillar | Plugin | Who it's for | Skip it if |
|--------|--------|--------------|------------|
| **Doctrine & arbitration** | `o9k-core` *(required)* | Everyone. The arbitration table, host wiring, and the `/o9k-*` commands. This is o9k. | — |
| **Context discipline** | `o9k-scout` | People working in real codebases, especially large or unfamiliar ones. Search before read, one canonical repo map per session. | Your sessions touch few files, or your work isn't code. |
| **Memory** | `o9k-memory` | Projects spanning many sessions. Briefing at session start, recall on demand, flush before compaction. | One-off tasks, or you don't want a memory MCP ([TIM](https://github.com/Bumblebiber/tim) / [hmem](https://github.com/Bumblebiber/hmem)) installed. |
| **Discovery** | `o9k-recon` | People who curate their tool stack — scouting new frameworks, installing companion bundles. | Your stack is settled. Install it the day you go shopping. |

### Spun out of o9k

o9k connects frameworks; it does not ship features of its own. These used to be
pillars and now live in their own repos. `/o9k-init` offers each one with the
same for/skip framing, and o9k keeps arbitrating their concerns.

| Package | Concern | Who it's for |
|---------|---------|--------------|
| [caveman](https://github.com/JuliusBrussee/caveman) *(upstream, not ours)* | output style | Long sessions where the agent's own prose is a real share of the context. ~65% measured output reduction; code, commands and error strings stay verbatim. Disable its `cavecrew` and `caveman-stats` skills — those concerns belong to `team-up` and `/o9k-stats`. |
| [team-up](https://github.com/Bumblebiber/team-up) | multi-agent roster | Driving several CLIs/models at once: role→model fallback chains, usage collector, limit watch, cross-CLI mailbox runs. See [docs/MULTI-AGENT.md](docs/MULTI-AGENT.md). |
| [o9k-statusline](https://github.com/Bumblebiber/o9k-statusline) | status bar | Model, context fill, limit headroom, git and memory project at a glance in Claude Code, Cursor or Hermes. |
| [md-provenance](https://github.com/Bumblebiber/md-provenance) | file attribution | Repos filling up with agent-written HANDOFF/PLAN/RESULT files, where you later need to know who wrote what and why. |
| [bundle-bench](https://github.com/Bumblebiber/bundle-bench) | benchmarking | Maintainers who want pass-count and cost numbers for a companion combo instead of README claims. |

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

What automation can't do (a one-time `hmem init`, disabling legacy superpowers
dispatch skills if still active), the agent handles conversationally:
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

## Platforms

| OS | o9k pillars | team-up companion (multi-agent) |
|----|-------------|----------------------------------|
| **Linux** | ✅ full | ✅ full |
| **macOS** | ✅ full | ⚠️ needs `brew install tmux` |
| **Windows** | ✅ full | ❌ tmux/bash stack — use **WSL** |

`/o9k-init` prints this as a Platform line first and skips setup questions the
host OS can't honor.

## Install

**Fast path (npm — Cursor, Codex, OpenCode, Hermes, and a global CLI):**

```bash
npm i -g its-over-9k && o9k setup
```

`o9k setup` wires shared skills and session hooks for every detected host.
Then optionally install a memory backend (or pick one in `/o9k-init`):

```bash
npm install -g tim-cli && tim init          # preferred
# or: npm install -g hmem-mcp && hmem init
```

(Scoped alias `@bumblebiber/o9k` is prepared in-repo; install via `its-over-9k`
until the scoped name is publicly resolvable on the registry.)

**Claude Code (in-session marketplace):**

```
/plugin marketplace add Bumblebiber/its-over-9k
/plugin install o9k-core@o9k
```

`o9k-core` is all you install by hand. Run `/o9k-init` next — it walks the
optional pillars one at a time, tells you who each is for and who should skip
it, and installs only what you say yes to.

Then run **`/o9k-init`** in a session — it detects your setup, walks you
through the companion bundle choice, and handles conflicts and migration.

**Works with Claude Code, Codex, Cursor, OpenCode, and Hermes** on the same
machine: `/o9k-init` (or `o9k setup`) syncs shared o9k skills and wires session
hooks on every detected host (it never installs missing CLI binaries — see the
[`o9k-init` skill](plugins/o9k-core/skills/o9k-init/SKILL.md)).

**TIM** ([npm `tim-cli`](https://www.npmjs.com/package/tim-cli)) and **hmem**
([npm `hmem-mcp`](https://www.npmjs.com/package/hmem-mcp)) are both supported
memory backends. `/o9k-init` asks which to install (or wire a custom MCP).
`o9k-memory` auto-detects and prefers TIM when `tim` is on PATH (or `TIM_CLI`
is set); otherwise it uses hmem. Track TIM at
[Bumblebiber/tim](https://github.com/Bumblebiber/tim).

### Migrating from `its-over-9k@1.x` (clean reinstall)

`1.x` was the **old hmem CLI** (`bin: hmem` / `hmem-curate`), not this
meta-framework. Do a clean swap — do not leave the old global install in place:

```bash
npm uninstall -g its-over-9k
npm install -g hmem-mcp && hmem init          # memory backend (replaces 1.x)
npm install -g its-over-9k@latest && o9k setup
```

After that, `which o9k` should point at the new CLI and `which hmem` at
`hmem-mcp`. If either still points at a stale path, clear your shell hash
(`hash -r`) or open a new terminal.

### One command for the companions

Don't hand-install the third-party frameworks below. `o9k-recon` ships a
bundle installer that wires up a whole tested stack at once:

```
/plugin install o9k-recon@o9k
```

then run the `companion-bundles` skill (or `install/o9k-companions.sh
recommended --run`). Bundles: `minimal`, `recommended`, `max` — see
[docs/BUNDLES.md](docs/BUNDLES.md).

## Doctor & uninstall

o9k writes symlinks, rules, and hook wrappers across host config dirs — two
scripts keep that auditable:

```bash
node plugins/o9k-core/scripts/o9k-doctor.mjs        # read-only: list artifacts, flag dangling/stale
node plugins/o9k-core/scripts/o9k-uninstall.mjs --dry-run   # then --run to remove them
```

The doctor flags dangling skill symlinks and wrappers whose baked marketplace
path no longer exists (e.g. after moving the clone — fix via
`update-check.mjs --refresh-hosts`). Uninstall removes only provably-o9k
artifacts, strips o9k entries from host hook configs without touching foreign
ones, keeps `~/.o9k` user data, and prints the manual follow-ups
(`/plugin uninstall`, systemd/launchd units).

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

1. **o9k × superpowers:** `team-up` owns subagent isolation by default;
   superpowers owns methodology. Disable stock `dispatching-parallel-agents` only
   if it is still enabled.
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

Early but functional. Five pillars (one required, four opt-in); hooks and
multi-CLI wiring ship for the hosts above.

- **SessionStart (o9k-core)** — injects a ~70-token doctrine directive (never
  documentation) so all installed pillars apply automatically; flags open
  arbitrations; offers `/o9k-guide` once on the first session. Disable via
  `O9K_CORE_HOOK=off`.
- **SessionStart update check (o9k-core)** — reports which pillars/companions
  are updatable, instantly from a cache; the actual version check runs detached
  in the background (once per `O9K_UPDATE_INTERVAL_HOURS`, default 24h), so it
  never slows session start. `O9K_UPDATE_CHECK=notify` (default) reports;
  `auto` also applies the safe npm-global updates (companions + `its-over-9k`
  when installed via npm); `off` disables. Claude marketplace plugins
  stay notify-only — never clobbered. After `/plugin marketplace update o9k`
  or `npm i -g its-over-9k@latest`, run `/o9k-update --refresh-hosts` (npm
  `--apply` already refreshes hosts when `its-over-9k` itself was updated).
- **SessionStart (o9k-memory)** — detects the memory backend (TIM via
  `tim resolve-project`, else hmem) and injects a compact loading *directive*
  (never memory content). Stays silent if the backend's own hooks are already
  installed — one owner per concern. Disable via `O9K_MEMORY_HOOK=off`.
- **PreCompact (o9k-memory)** — fires the backend's checkpoint (`tim checkpoint`
  / `hmem checkpoint`) in the background before compaction summarizes the
  session away. Never blocks or delays compaction.
- **Multi-agent (team-up, separate package)** — limit watch, subscription usage
  collector, and cross-CLI mailbox runs live in
  [team-up](https://github.com/Bumblebiber/team-up). o9k arbitrates the concern
  and requires `dispatch` path B once a roster exists; it ships none of that
  code. See [docs/MULTI-AGENT.md](docs/MULTI-AGENT.md).

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
write-up. Memory by [TIM](https://github.com/Bumblebiber/tim) (npm `tim-cli`)
and [hmem](https://github.com/Bumblebiber/hmem) (npm `hmem-mcp`). Compatibility research also
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
