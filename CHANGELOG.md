# Changelog

## [0.7.3] — 2026-07-15

### Added
- **Pillar drift check in the SessionStart hook.** If a previously-enabled
  pillar goes missing or gets disabled (accidental `claude plugin
  uninstall`/`disable`, a marketplace hiccup, …), the hook now flags it by
  name with an install command, instead of silently issuing standing orders
  for tools that aren't actually there. Only fires on a confirmed miss
  (`enabledPlugins` readable, pillar absent) — never on undeterminable
  detection.

## [0.7.2] — 2026-07-15

### Changed
- **SessionStart directive sharpened.** The injected doctrine text was easy to
  read as a soft suggestion ("apply automatically") and got skipped in
  practice. Reworded to an explicit MANDATORY framing (every turn, not "when
  convenient") with a self-correction clause. No technical enforcement exists
  — a hook can only inject context, not force tool calls — so this raises the
  odds of compliance, it doesn't guarantee it.

## [0.7.1] — 2026-07-15

### Fixed
- **`/o9k-init` and `companion-bundles` install plugins themselves.**
  `claude plugin install <name>@<marketplace>` and
  `claude plugin marketplace add <owner>/<repo>` turn out to be regular CLI
  commands (`claude plugin --help`), not the REPL-only `/plugin` slash
  command — confirmed live: all 5 missing o9k pillars and Ponytail installed
  straight from a shell. Step 5 of `/o9k-init` (and companion-bundles' "How
  to run") now runs these itself instead of printing a checklist for the
  user; only `/reload-plugins` and genuinely CLI-less installs (e.g. beads)
  stay manual.

## [0.7.0] — 2026-07-15

### Added
- **Compatibility layer in `o9k-core`** — the framework×concern knowledge is
  now machine-readable instead of scattered prose:
  - **`compat/registry.json`** — single source of truth: every pillar,
    companion, essential (git) and rival with its concern claims, detection
    spec (plugin/MCP/PATH/env), bundle membership, install command, the WHY
    rationale vs. the bundle pick, and its migration adapter.
  - **Generic arbitration**: `detectConflicts()` now flags any *exclusive*
    concern with two detected owners — new collisions come free with a
    registry entry, no code change.
  - **`scripts/o9k-migrate.mjs`** — export-first migration driver for
    `/o9k-init` Step 4. Per-rival adapters (claude-mem, mem0, task-master,
    derived-index, repo-docs, home-config) copy raw data to
    `~/o9k-migration-<date>/<rival>/raw/`, write a normalized
    `exchange.json` (memory entries, tasks with dependencies) plus
    `NOTES.md`/`MANIFEST.json`. Never deletes, never uninstalls.
- `docs/COMBINING.md`: "The compatibility layer" section — the doc page is
  now the human-readable rendering of the registry.

### Changed
- `detect.mjs`, `o9k-init.mjs`, `o9k-guide.mjs` are registry-driven: labels,
  bundle deltas, rival list (now printed with the WHY and the migrate
  command) all come from `compat/registry.json`. Public API unchanged.
- `/o9k-init` skill: the WHY table is replaced by the registry-fed snapshot
  output; Step 4 migration starts with `o9k-migrate.mjs` instead of manual
  copying.

## [0.6.0] — 2026-07-15

### Added
- **`/o9k-init` skill in `o9k-core`** — guided first-install & reconfiguration:
  - **Detect first** (`scripts/o9k-init.mjs`, read-only): pillars, git, memory
    backend, companions, per-bundle deltas, rival frameworks, arbitrations.
  - **Interview**: bundle choice presented as a delta from the actual setup,
    agent-run (non-interactive flags) vs. user-run (interactive) execution.
  - **Cheap-model policy**: on a flagship model the skill recommends
    `/model haiku` once and pushes detection/installs into cheap subagents
    either way — setup never burns flagship tokens on the heavy lifting.
  - **git as an essential**: not a hard prerequisite, but the skill recommends
    it with a reason and installs it (platform-specific) on the user's go.
  - **Conflict resolution with a WHY table**: for every detected rival
    (claude-mem/mem0, Graphify/claude-context/codebase-memory,
    token-optimizer, task-master, BMAD/spec-kit/SuperClaude) the agent can
    explain in one breath why the bundle pick is the better half of the pair;
    the user chooses uninstall-and-migrate or keep-rival-drop-companion.
  - **Mandatory migration on uninstall**: export to
    `~/o9k-migration-<date>/` first (data is never deleted), then migrate —
    memory rivals → hmem entries, task-master → beads issues, spec docs stay
    in the repo.
- `detect.mjs`: companions now include `git`; new `detectRivals()`
  (best-effort via enabled plugins, MCP server names, PATH).
- `install/o9k-companions.sh`: git line in the prerequisite check.

### Changed
- First-run SessionStart offer now points to `/o9k-init` (guided setup);
  `/o9k-guide` stays the read-only orientation and links to it.
- `companion-bundles` skill defers to `/o9k-init` for first installs.

### Fixed
- **hmem npm package name**: the package is **`hmem-mcp`** (binary stays
  `hmem`) — `npm install -g hmem` was a 404. Corrected in README, the
  companions installer, `/o9k-guide` (script + skill), the memory skill, and
  the update checker's npm target map (it was version-checking a nonexistent
  package). Also dropped `npx hmem init` (resolves the wrong package) in
  favor of plain `hmem init`.

## [0.5.0] — 2026-07-09

### Added
- **Dependency update checker in `o9k-core`** (`scripts/update-check.mjs`,
  zero deps):
  - **SessionStart hook** — reports updatable pillars/companions instantly from
    a cache; the actual `npm view` / `git fetch` checks run **detached in the
    background** (throttled by `O9K_UPDATE_INTERVAL_HOURS`, default 24h) so
    session start never waits on the network.
  - **Policy** via `O9K_UPDATE_CHECK`: `notify` (default) reports only; `auto`
    also applies the *safe* updates (npm-global CLIs: hmem, ast-grep, ccusage);
    `off` disables. o9k plugins, the marketplace, and git/uvx tools are always
    notify-only — never auto-clobbered (`/plugin marketplace update o9k` is
    suggested when the local o9k clone is behind upstream).
  - **`/o9k-update` skill** — on-demand `--report` (read-only) and `--apply`
    (perform safe updates) with a human-readable status.

## [0.4.0] — 2026-07-09

### Added
- **Zero-effort automation in `o9k-core`:**
  - **SessionStart hook** — injects a ~70-token doctrine directive every session
    so all installed pillars apply automatically; the human never invokes
    anything. Detects installed pillars/companions, flags open arbitrations
    (e.g. two dispatch owners), and offers `/o9k-guide` once on the first
    session (marker: `~/.claude/o9k-first-run-done`). Opt out:
    `O9K_CORE_HOOK=off`.
  - **`/o9k-guide` skill** — personalized one-minute orientation for the human,
    backed by `scripts/o9k-guide.mjs` (read-only setup detector: pillars,
    memory backend, companions, conflicts, gaps). Tells the user only what
    their setup is missing and offers to fix each item.
  - `scripts/detect.mjs` — shared zero-dependency detection (enabled plugins,
    MCP servers, CLIs on PATH), degrades gracefully to sibling-directory
    probing when settings are unreadable.

## [0.3.0] — 2026-07-09

### Added
- **`o9k-recon` plugin** — discovery & onboarding:
  - **`framework-scout`** skill — a GitHub Scout: where to hunt for new agent
    frameworks (Topics, Trending/OSSInsight, the plugin directory, awesome-lists),
    a six-signal scoring rubric (concern → alive → traction → license → install →
    claim-vs-reality), and how to classify a candidate as 🟢 symbiotic / ⚪
    orthogonal / 🔴 blocking before proposing a matrix or bundle update.
  - **`companion-bundles`** skill + **`install/o9k-companions.sh`** — one-command,
    dry-run-by-default installer for conflict-free companion stacks
    (`minimal` / `recommended` / `max`). See `docs/BUNDLES.md`.
- **Expanded "Playing with others"** into a three-tier compatibility matrix
  (symbiotic / orthogonal / blocking) in the README and `docs/COMBINING.md`,
  covering Context7, ccusage, Ponytail, Graphify, claude-mem, mem0,
  claude-context, codebase-memory-mcp, tokenmax, token-optimizer-mcp, BMAD,
  spec-kit, SuperClaude, task-master, plus a framework×framework conflict grid.
- **Ponytail** (DietrichGebert) documented as o9k's closest cousin — code
  minimalism on a new axis (trims the diff; caveman trims the prose) — and added
  to every bundle.

### Changed
- **TIM status corrected:** TIM is not yet published. **hmem is now the documented
  available default** across README, `docs/COMBINING.md`, and plugin metadata;
  TIM is labeled *planned*, with the SessionStart hook auto-preferring it once it
  ships. Removes the misleading "recommended" claim for an unreleased backend.

## [0.2.0] — 2026-07-09

### Added
- **`o9k-memory` hook automation** (`hooks/hooks.json` + Node scripts, no deps):
  - `SessionStart`: backend detection (TIM preferred — uses
    `tim resolve-project --format directive` against the nearest `.tim-project`
    marker; hmem fallback emits a load_project directive). Skips itself when the
    backend's own hooks are already installed in `~/.claude/settings.json`,
    honoring the one-owner-per-concern rule. Opt out: `O9K_MEMORY_HOOK=off`.
  - `PreCompact`: fire-and-forget backend checkpoint (`tim checkpoint --session`
    / `hmem checkpoint`) so state is persisted before compaction loses it.
- **`/o9k-stats`** in `o9k-core`: zero-dependency token report from
  `~/.claude/projects/*/`*.jsonl* — output/input/cache totals, output share,
  avg output per turn, with interpretation guide.

## [0.1.0] — 2026-07-08

Initial scaffold. its-over-9k is reborn as a meta-framework — the memory
framework that previously carried this name is `hmem` again
(https://github.com/Bumblebiber/hmem).

### Added
- Claude Code plugin marketplace (`.claude-plugin/marketplace.json`, name `o9k`)
- Five pillar plugins, each shipping one skill:
  - `o9k-core` — the doctrine + arbitration layer (`using-o9k`)
  - `o9k-caveman` — output compression, adapted from JuliusBrussee/caveman (MIT)
  - `o9k-scout` — context-loading discipline
  - `o9k-dispatch` — cost-gated subagent isolation
  - `o9k-memory` — memory-MCP integration; recommends TIM, hmem as alternative
- `docs/COMBINING.md` — conflict rules for superpowers, beads, Serena, caveman,
  codesight/ast-grep/repo-map, LLMLingua

### Planned
- `hooks/hooks.json` automation for o9k-memory (SessionStart briefing injection,
  PreCompact flush) instead of convention-only
- `/o9k-stats` — measure actual token savings from session logs
- Optional bundled `.mcp.json` for TIM once published
