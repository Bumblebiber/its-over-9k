---
name: o9k-init
description: "Guided first-install and reconfiguration flow for o9k. Use when the user invokes /o9k-init, on a fresh o9k install, or when the user wants to set up, reconfigure, or extend their companion stack. Detects what's installed, interviews the user (bundle, git, conflicts), resolves collisions with migration, then executes the setup."
---

# o9k-init — Guided Setup

The one flow that takes a machine from "just added the marketplace" to a
conflict-free stack of exactly the pieces this user wants. It detects before it
asks, asks before it acts, and never destroys data. `/o9k-guide` explains a
setup; **`/o9k-init` builds one.** After `/o9k-update` reports a **NEW PILLAR**,
re-run this flow to offer it — `--refresh-hosts` alone only syncs pillars that
are already installed.

**Complete is not the goal.** o9k connects frameworks; it does not sell all of
them. `o9k-core` is the connector and installs unasked. Everything else — the
four other pillars and the five spun-out packages — is a separate opt-in with a
default of **no**. A user who only wants core plus scout has a correct install,
not a partial one.

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

Read-only, instant. The first line is a **Platform** note — surface it to the
user *before* the interview when it lists limitations (team-up needs tmux;
native Windows needs WSL for it). Never offer something the OS can't run —
skip the team-up question on native Windows and say why.

The snapshot also gives you: pillars (each with its `for:` / `not for:` line),
git, memory backend, companions, a **Spun out of o9k** section, **bundle
deltas** (what each bundle would still add), rival frameworks, open
arbitrations, a **Hosts** section, and an **Unknown installed** section
(plugins / MCPs / skills present on the machine that are **not** in
`compat/registry.json`). Detection is best-effort — "no" means *not
detected*, so if the user says they have a tool, believe them.

The `for:` / `not for:` lines come from `compat/registry.json`. Use them — they
are the script for Step 2a. Never invent your own audience description, and
never edit the registry to change one.

The unknown list is open-world for **plugins and MCP servers** across hosts.
**Skills** are scoped to `~/.agents/skills` and Claude's skill dir only
(Hermes/Codex/OpenCode stock skill trees are skipped — they are not o9k
rivals). **Never** auto-research, trial, uninstall, or recommend removal of
an unknown without an explicit user Go (Step 2b).

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

0. **Pillars — one opt-in question each.** See Step 2a. Do this *first*: every
   later question depends on which pillars exist (no memory pillar → skip the
   backend question; no recon → no bundle question).
1. **Bundle** — offer `minimal` / `recommended` / `max`, each shown as its
   *delta* from the snapshot ("recommended adds: Context7, beads, Serena —
   you already have hmem and superpowers"). Recommend `recommended` unless
   the machine/repo is clearly tiny (→ minimal) or huge/polyglot (→ max).
   Bundles still list `hmem` as the memory *slot* — Step 2 memory choice
   overrides that (TIM / custom → drop `hmem` from the companion install).
2. **Memory backend** — ask whenever snapshot is `NONE`, both TIM+hmem, or
   the user is reconfiguring. If exactly one backend is already present and
   they are not reconfiguring, confirm **keep (default)** vs switch.
   Options (one pick):
   - **A. TIM** — npm package `tim-cli` (bin `tim`). Multi-host MCP wiring
     (`tim setup-agent`). Recommend on a fresh machine (hooks prefer TIM).
   - **B. hmem** — npm package `hmem-mcp` (bin `hmem`). Stable public
     default; recommend when TIM is unwanted or already excluded.
   - **C. Own memory MCP** — user names the server + how to start it; you
     wire host MCP configs only. `o9k-memory` SessionStart/PreCompact hooks
     only auto-drive TIM and hmem — for custom, say sessions start without
     the o9k briefing unless their MCP owns that lifecycle, and set
     `O9K_MEMORY_HOOK=off` if their hooks already cover it.
   - **D. Skip** — no memory install; note the gap in the final report.
   If both TIM and hmem are detected: treat as exclusive-memory conflict
   (Step 3) — pick one winner, offer uninstall+migrate for the other.
3. **Setup mode** —
   - **Agent-run (recommend this):** you execute everything non-interactively
     and report at the end. Uses the non-interactive flags below.
   - **User-run:** you print the commands (interactive variants, e.g. plain
     `hmem init` / `tim init`) and the user drives.
4. **Conflicts** — only if Step 1 found rivals; see Step 3.
5. **Unknowns** — only if Step 1 printed `Unknown installed`; see Step 2b.
6. **git** — only if missing; see below.

### Step 2a — pillars: opt-in, one at a time

**Nothing is preselected.** `o9k-core` is the only pillar that installs
unasked — it *is* o9k (arbitration, host wiring, the `/o9k-*` commands), and
the user already has it if they got this far. Every other pillar, and every
spun-out companion, is a separate yes/no.

Not everyone writes much code, and o9k is a connector, not a bundle: a pillar
nobody uses is pure session-start tax. So for **each** pillar the snapshot
shows as `no`:

> **`<pillar>`** — `<audience line from the snapshot>`
> Skip it if: `<not-for line from the snapshot>`
> Install it? (yes / no / tell me more)

Rules for this loop:

- **One pillar per question.** Do not present a checklist of five and ask for
  a multi-select — the user cannot weigh five audience descriptions at once.
- **Read them the `not for:` line too**, not just the pitch. A user who
  recognizes themselves in it should feel free to say no.
- **Default is no.** Silence, "whatever you think", or an unclear answer is a
  **skip**, not a yes. Say which way you took it and move on.
- **No pressure, no second ask.** One "no" per pillar per run. `/o9k-init` is
  re-runnable; that is the answer to "what if I want it later", and worth
  saying once at the end.
- **Recommend only when the machine says so.** If the snapshot shows a large
  repo, many hosts, or an existing memory backend, name that as the reason
  ("you already run TIM, so o9k-memory has something to wire"). Never
  recommend a pillar from enthusiasm alone.
- **Already-installed pillars are not re-asked.** They show `yes`; leave them.
  Only offer removal if the user brings it up.

Then, in the same style, the **Spun out of o9k** section: `caveman`, `team-up`,
`o9k-statusline`, `md-provenance`, `bundle-bench`. These used to be pillars and
now live outside this repo — same for/not-for framing, same default-no, install
via the `install:` line the snapshot prints. Read the `caveat:` line out loud
when one is present: `caveman` is **upstream's** project, not an o9k fork, and
two of its four skills claim concerns o9k assigns elsewhere. Skip `team-up` on
native Windows and say why (needs tmux/bash → WSL).

If the user says "just give me the usual" or otherwise delegates the whole
choice: install `o9k-core` + `o9k-scout`, say that in one
line, and note that memory, recon and the spun-out packages are one
`/o9k-init` away. Do not silently install more than that on a delegation.

### Step 2b — unknowns: ask, then evaluate (never silent)

Registry rivals already have a WHY. Unknowns do not. For **each** unknown
(or a batched shortlist if there are many), ask one clear question:

> I found `<name>` installed, but it is not in o9k's compatibility registry.
> May I check whether it conflicts with o9k / whether it might be better than
> what o9k ships for the same concern?

- **No / skip** → leave it alone; note "kept without evaluation" in the final
  report. Do not fetch GitHub, do not trial.
- **Yes** → proceed in this order (stop early when the answer is clear):

  1. **GitHub / README first** — use the `framework-scout` skill Steps 2–3
     (score + classify 🟢/⚪/🔴). Prefer `gh` / WebFetch of the repo README;
     do **not** clone the whole tree. Produce a provisional verdict vs the
     overlapping o9k pillar or bundle companion (name the concern).
  2. **If README is enough** to say keep / remove / orthogonal → report that
     and ask what to do (keep, uninstall+migrate if dataful, or drop the
     colliding o9k pick). No trial yet.
  3. **If still unclear** whether it beats o9k's pick → run the measured
     protocols (explicit budget warning first):
     - **Single candidate** → `framework-scout` Step 4 trial (sandbox only;
       never live `~/.claude`).
     - **Combo / "is this better in the stack?"** → `bundle-bench` skill
       (`benchmarks/run-bench.sh`) after user signs off on the combo list.
  4. **Upstream feedback** — if the verdict is "better than o9k's pick" (or
     a strong 🟢 symbiotic missing from the registry), open or draft a
     GitHub **Issue or PR** on `Bumblebiber/its-over-9k` with: candidate
     name/repo, concern, README verdict, trial/bench numbers if any, and a
     proposed `compat/registry.json` row. Do not silently edit the registry
     on the user's machine as "upstream truth".

Unknowns are **not** auto-rivals. Classification happens only after Go.

### Multi-agent roster (team-up) — companion, not a pillar

Role-based model selection, fallback chains and mailbox runs live in the
standalone **team-up** package (`npm i -g team-up`), offered in the Step 2a
spun-out list. o9k neither ships nor wraps that runtime; it only arbitrates
the `roster` concern and points at it.

If the user installs team-up, run `team-up init` and tell them to curate the
roster (models, chains) — the scaffold is example data. Say once in the final
report: **every external CLI worker spawn must complete the mailbox protocol**
(`runs create` → `dispatch --run-id` → cheap `runs wait` watcher) — see
team-up's `dispatch` path B and `docs/MULTI-AGENT.md`.

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
   - memory rivals → chosen backend (TIM or hmem): distill `exchange.json`
     entries via the memory MCP. Migrate insights, not chat logs.
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

### 1) Memory (from Step 2 choice — never auto-pick past the interview)

Drop `hmem` from the companion-bundle install list when the choice is TIM,
custom, or skip.

**A. TIM** (npm `tim-cli`, bin `tim`):

```bash
npm i -g tim-cli    # agent-run only; skip if `tim` already on PATH
tim init            # when it covers present hosts in one pass
# else per present host (TIM hosts today):
tim setup-agent --host claude    # also: codex, cursor, hermes
```

OpenCode: TIM `setup-agent` has no `opencode` host yet — note MCP wiring as
manual in the final report (or skip). User-run: plain `tim init` /
interactive `tim setup-agent`.

**B. hmem** (npm `hmem-mcp`, bin `hmem`):

```bash
npm i -g hmem-mcp   # agent-run only; skip if already installed
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

For Codex/Hermes on hmem-only: note MCP wiring as manual (or switch to TIM).

User-run mode: plain `hmem init` (interactive) instead of `--global`.

**C. Own memory MCP:**

Wire the user's server into each **present** host's MCP config (Claude:
`claude mcp add …`; Cursor/Codex/OpenCode/Hermes: host-native MCP files —
same paths `host-wire` / TIM docs use). Do **not** install `tim-cli` or
`hmem-mcp` unless asked. Record server name + start command in the final
report. If their MCP owns SessionStart/compact itself → set
`O9K_MEMORY_HOOK=off`; otherwise warn that o9k-memory hooks will not brief.

**D. Skip:** leave backend unset; final report lists the gap.

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
claude plugin install o9k-scout@o9k                      # pillars the user said yes to
claude plugin marketplace add JuliusBrussee/caveman      # upstream, not an o9k repo
claude plugin install caveman
claude plugin marketplace add DietrichGebert/ponytail    # third-party, from source
claude plugin install ponytail
```

Loop over **exactly the pillars the user opted into in Step 2a** — never "every
missing pillar" — plus the spun-out packages they accepted and every bundle
plugin (superpowers, Ponytail, …). After installing, tell the user to run
`/reload-plugins` once (that one genuinely can't be done from a shell).

### 5) Companion bundle (unchanged)

Always **dry-run the bundle first** and show the plan:
`install/o9k-companions.sh <bundle>` — then `--run` to execute (skip lines for
companions dropped in Step 3, and for anything Step 1 already showed as
installed).

### 6) Spun-out packages (only the ones accepted in Step 2a)

Each owns its own install and wiring — run the `install:` line the snapshot
printed and let the package do the rest. o9k does not wire them.

```bash
npm i -g o9k-statusline
o9k-statusline-wire --dry-run --hosts claude:replace,cursor:replace   # show the plan
o9k-statusline-wire --hosts claude:replace,cursor:replace
```

For statusline, collect keep/replace/skip per **present** host first; Codex and
OpenCode report `unsupported` — surface that rather than pretending to wire.

Its built-in segments are generic (model, context, git, device). Anything
tool-specific is a **provider**: a command in `~/.o9k/statusline.json` that
prints one line. So when the user's stack already contains a tool that can
report, offer to add the matching provider entry — memory project from TIM or
hmem, usage windows from team-up, cost from ccusage. Do **not** add a provider
for a tool the snapshot did not detect, and never invent a flag: check the
tool's own docs, or leave it out and say so.

If the snapshot's `Spun out of o9k` section shows a host still wired to the
**old in-tree** statusline, `node "${CLAUDE_PLUGIN_ROOT}/scripts/o9k-doctor.mjs"`
flags it as `orphaned`. Fix by installing `o9k-statusline` and re-wiring, or by
deleting the dead `statusLine` entry. Never leave it dangling.

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
plan owner when beads + superpowers plan files coexist). Close with: `/o9k-guide` re-explains any
time, `/o9k-stats` measures the effect.

## Rules

- Detect before asking; ask before acting; **never uninstall without an
  explicit go**, never delete data (export first — Step 4 is mandatory).
- **Never research an unknown** (GitHub, trial, bench) without explicit Go
  in Step 2b — listing it in the snapshot is enough until then.
- One question at a time. The snapshot decides what's asked — never walk a
  fully-set-up user through the whole interview.
- **Every pillar past `o9k-core` is opt-in, default no** (Step 2a). Never
  install a pillar because it exists, because the stack "looks incomplete",
  or because it pairs nicely with another. A pillar nobody uses is session
  cost with no return.
- **Read the `not for:` line out loud too.** Selling only the upside is how a
  user ends up with five pillars and three of them idle.
- Re-runs are normal: `/o9k-init` on a configured machine is how you *extend*
  (e.g. minimal → recommended, or add a pillar you skipped) — same flow,
  smaller deltas. Say this once instead of pushing a pillar twice.
- Don't fight the user's choice. B (keep the rival) is legitimate; state the
  consequence once and move on.
