---
name: o9k-init
description: "Guided first-install and reconfiguration flow for o9k. Use when the user invokes /o9k-init, on a fresh o9k install, or when the user wants to set up, reconfigure, or extend their companion stack. Detects what's installed, interviews the user (bundle, git, conflicts), resolves collisions with migration, then executes the setup."
---

# o9k-init — Guided Setup

The one flow that takes a machine from "just added the marketplace" to a
complete, conflict-free o9k stack. It detects before it asks, asks before it
acts, and never destroys data. `/o9k-guide` explains a setup; **`/o9k-init`
builds one.**

## Step 0 — model check (do this before anything else)

Setup is detection + questions + installs — a cheap-model job. Check which
model you are:

- **Flagship active** (Claude Opus/Fable, or another vendor's top model):
  recommend once — *"Setup doesn't need a flagship. Switch with `/model haiku`
  and run `/o9k-init` again — same result, fraction of the cost."* If the user
  declines or just keeps going, **continue** — don't nag twice.
- **Either way**: keep the main context for the interview and decisions.
  Push the heavy lifting — broad detection sweeps, install execution, install
  verification — into cheap subagents (Haiku-class) whenever the harness
  supports it.

## Step 1 — detect

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/o9k-init.mjs"
```

Read-only, instant. Gives you: pillars, git, memory backend, companions,
**bundle deltas** (what each bundle would still add), rival frameworks, open
arbitrations, and a **Hosts** section. Detection is best-effort — "no" means
*not detected*, so if the user says they have a tool, believe them.

### Hosts section

After pillars and essentials, the snapshot lists every supported coding CLI:

| Host | What the line shows |
|------|---------------------|
| Claude Code | `present`/`absent` + `skills=` `hooks=` `mcp=` |
| Codex | same |
| Cursor | same |
| OpenCode | same |
| Hermes | same |

- **`present`** — binary on PATH and/or home dir exists (registry-driven).
- **`skills=`** — canonical `~/.agents/skills/o9k/` synced and linked into this
  host (Cursor may use Rules instead of symlinks).
- **`hooks=`** — o9k session/pre-compact hooks wired via host-native config.
- **`mcp=`** — memory MCP reachable for this host (best-effort heuristic).

Only **present** hosts get wired in Step 5. Absent hosts are reported, never
auto-installed. If the user insists they use an absent host, believe them and
wire after they create the home dir / install the binary (see Step 2).

## Step 2 — interview

Ask, don't lecture. One question at a time, options not essays. In order:

1. **Bundle** — offer `minimal` / `recommended` / `max`, each shown as its
   *delta* from the snapshot ("recommended adds: Context7, beads, Serena —
   you already have hmem and superpowers"). Recommend `recommended` unless
   the machine/repo is clearly tiny (→ minimal) or huge/polyglot (→ max).
2. **Setup mode** —
   - **Agent-run (recommend this):** you execute everything non-interactively
     and report at the end. Uses the non-interactive flags below.
   - **User-run:** you print the commands (interactive variants, e.g. plain
     `hmem init`) and the user drives.
3. **Conflicts** — only if Step 1 found rivals; see Step 3.
4. **git** — only if missing; see below.

### Multi-CLI hosts (do not install CLIs)

**Never offer to install** `claude`, `codex`, `cursor-agent`, `opencode`, or
`hermes` binaries — that is outside o9k's scope. If the snapshot marks a host
`absent` but the user says they use it, believe them: ask them to create the
host home dir or install the binary themselves, then run
`host-wire.mjs --run --only=<host>` (and `skills-sync.mjs` if skills are still
`no`). Record any manual MCP gaps in the final report.

### git (essential, not a gate)

git is not a hard prerequisite — but a developer machine without it is
misconfigured: no checkpoints of agent work, no diffs, no revert, and half
the companion installs assume it. If the snapshot says `git no`:

1. Recommend installing it and say why (one sentence, the above).
2. **On the user's go, install it yourself** — don't paste commands at them:
   - Linux: `sudo apt-get install -y git` / `dnf install -y git` /
     `pacman -S --noconfirm git` / `zypper install -y git` (match the distro)
   - macOS: `brew install git` (or `xcode-select --install` if no brew)
   - Windows: `winget install --id Git.Git -e`
3. Verify with `git --version`. No go → proceed without it, note the gap in
   the final report.

## Step 3 — conflicts: explain WHY, then ask

For every detected rival that collides with the chosen bundle, the user picks
one of two paths — never decide for them:

> **A.** Uninstall the rival (you migrate its data first — Step 4), or
> **B.** Drop the colliding companion from this bundle and keep the rival.

You must be able to say **why the bundle pick is the better half** of each
pair — that's the argument, made in one or two sentences, user's language.
The Step 1 snapshot prints it per detected rival (`why ours: …`) straight
from the compat registry (`compat/registry.json`) — the single source of
truth for concerns, rivalries, and rationale. Deliver it as your own
argument, not as a quote; translate to the user's language.

If the user picks **B** for a memory rival, `o9k-memory`'s hooks will find no
backend they know — say that plainly (sessions start from zero) and continue.

## Step 4 — migration (on every uninstall, agent's discretion)

Rule one: **data is never deleted, only the tool.** Before uninstalling
anything:

1. **Export first — run the migration driver:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/o9k-migrate.mjs" <rival-id>
   ```
   (`--list` shows the ids.) It copies the rival's raw data to
   `~/o9k-migration-<YYYY-MM-DD>/<rival>/raw/`, writes a normalized
   `exchange.json` where the format is parseable, and `NOTES.md` with the
   import instructions. It never deletes or uninstalls anything. Run it from
   inside the project for repo-local rivals (task-master, spec-kit, BMAD).
   The backup stays even after a successful migration.
2. **Import what has a home** — follow `NOTES.md`, your judgment on the rest:
   - memory rivals → hmem: distill `exchange.json` entries into hmem via the
     memory MCP. Migrate insights, not chat logs.
   - task-master → beads: recreate the *open* items from `exchange.json`
     with `bd create`, then wire the dependencies. Done/stale items stay in
     the export only.
   - BMAD/spec-kit/SuperClaude → their PRDs and specs are project documents:
     leave them in the repo (e.g. `docs/`), they need no new owner.
   - derived indexes (Graphify, claude-context, …) → nothing to import;
     they rebuild from source.
3. **Show the user a one-screen summary** — N items migrated, backup path —
   *then* uninstall (`npm rm -g` / `claude mcp remove` / `claude plugin uninstall`,
   all regular shell commands you run yourself).

## Step 5 — execute

Order: git (if agreed) → **memory** → **skills** → **hooks** → **Claude
pillars** (when Claude present) → **companion bundle** → Step 4 uninstalls.

### 1) Memory (prefer detected backend)

**TIM detected** (snapshot shows `memory backend TIM`):

```bash
# Per present host — TIM owns multi-host MCP wiring when available
tim setup-agent --host claude    # repeat for codex, cursor, opencode, hermes as present
# Or `tim init` when it already covers all present hosts in one pass
```

**Else hmem** (default public backend):

```bash
npm i -g hmem-mcp   # agent-run only; user-run: skip if already installed
hmem init --global --tools <mapped-list>
```

Map present hosts to hmem `--tools` ids:

| Host | hmem tool id | Notes |
|------|--------------|-------|
| Claude Code | `claude-code` | always when Claude present |
| Cursor | `cursor` | when Cursor present |
| OpenCode | `opencode` | when OpenCode present |
| Codex | — | **skip in hmem** until upstream supports it |
| Hermes | — | **skip in hmem** until upstream supports it |

For Codex/Hermes when TIM is absent: note in the final report that MCP wiring
is manual for now (or rely on `tim setup-agent` once TIM is installed).

User-run mode: plain `hmem init` (interactive) instead of `--global`.

### 2) Skills sync

Dry-run first, then execute:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/skills-sync.mjs" --dry-run
node "${CLAUDE_PLUGIN_ROOT}/scripts/skills-sync.mjs"
```

Installs canonical skills under `~/.agents/skills/o9k/` and symlinks (or Cursor
Rules) into each **present** host. Per-host errors are collected — one failure
does not abort the rest.

### 3) Host hooks

Dry-run first, then wire:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/host-wire.mjs" --dry-run
node "${CLAUDE_PLUGIN_ROOT}/scripts/host-wire.mjs" --run
```

Use `--only=codex` (etc.) when the user overrode an absent snapshot. Claude
pillars keep marketplace-owned hooks; other hosts get merged native config.

### 4) Claude pillars (unchanged — only when Claude is present)

**Plugins install from the CLI — run them yourself, don't hand them to the
user.** `claude plugin install <name>@<marketplace>` and
`claude plugin marketplace add <owner>/<repo>` are regular shell commands,
not the `/plugin` REPL-only slash command:

```bash
claude plugin install o9k-caveman@o9k    # missing o9k pillars
claude plugin marketplace add DietrichGebert/ponytail   # third-party, from source
claude plugin install ponytail
```

Loop for every missing pillar and every bundle plugin (superpowers, Ponytail,
…). After installing, tell the user to run `/reload-plugins` once (that one
genuinely can't be done from a shell).

### 5) Companion bundle (unchanged)

Always **dry-run the bundle first** and show the plan:
`install/o9k-companions.sh <bundle>` — then `--run` to execute (skip lines for
companions dropped in Step 3, and for anything Step 1 already showed as
installed).

### Other

- **Only hand the user a manual step when there truly is no CLI path** — e.g. a
  companion with no npm/go/brew package and no plugin marketplace (check before
  assuming; point at the upstream repo instead).
- Fold in any Step 4 uninstalls *after* their migration completed
  (`claude plugin uninstall <name>` / `claude mcp remove <name>` / `npm rm -g <pkg>`).

## Step 6 — verify & hand off

Re-run the snapshot (subagent if flagship). Then report one screen: what got
installed, **Hosts** status per CLI (`skills=` / `hooks=` / `mcp=`), what was
migrated (with backup path), what was dropped and why, remaining manual steps
(incl. codex/hermes MCP gaps when hmem-only), remaining arbitrations (e.g.
dispatch owner if superpowers joined). Close with: `/o9k-guide` re-explains any
time, `/o9k-stats` measures the effect.

## Rules

- Detect before asking; ask before acting; **never uninstall without an
  explicit go**, never delete data (export first — Step 4 is mandatory).
- One question at a time. The snapshot decides what's asked — never walk a
  fully-set-up user through the whole interview.
- Re-runs are normal: `/o9k-init` on a configured machine is how you *extend*
  (e.g. minimal → recommended) — same flow, smaller deltas.
- Don't fight the user's choice. B (keep the rival) is legitimate; state the
  consequence once and move on.
