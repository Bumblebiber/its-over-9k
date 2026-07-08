# Combining Frameworks Without Collisions

o9k is a meta-framework: it assumes you'll mix it with other tools. This page
lists the tested combinations, what each adds, and the conflict rules that keep
them from fighting. The general law (from `using-o9k`): **exactly one owner per
concern** — one output style, one SessionStart injector, one repo map, one plan,
one dispatch mechanism.

## Recommended stack

| Layer | Tool | Notes |
|-------|------|-------|
| Efficiency doctrine | **o9k** (this repo) | The five pillars |
| Memory MCP | **[TIM](https://github.com/Bumblebiber/tim)** | Recommended. hmem is the stable alternative — never both. |
| Workflow methodology | **[superpowers](https://github.com/obra/superpowers)** | Optional, excellent |
| Task/plan store | **[beads](https://github.com/steveyegge/beads)** | Optional, shines with multiple agents |
| Symbol navigation | **[Serena](https://github.com/oraios/serena)** | Optional, big repos |

## Per-framework rules

### superpowers (obra) — workflow discipline
MIT. Brainstorm → plan → TDD → debug → review → finish, as Claude Code skills.

- **Adds:** process quality. o9k doesn't cover methodology at all — perfect fit.
- **Conflicts:** (1) It ships its own dispatch skills
  (`dispatching-parallel-agents`, `subagent-driven-development`) — pick either
  those or `o9k-dispatch`, disable the other. (2) Its plan files: if beads is
  installed, plans belong in beads (see below).
- **Verdict:** install alongside o9k; resolve the two conflicts once.

### beads (steveyegge) — task graph offload
MIT. Dependency-aware issue tracker (Dolt-backed, `bd` CLI + MCP) built for agents.

- **Adds:** "the plan" moves out of context entirely; agents query only
  unblocked work. Multi-agent safe (hash IDs, no merge collisions).
- **Conflicts:** every other plan mechanism — superpowers' plan markdown,
  TODO files, plan sections in memory. One plan owner: beads.
- **Verdict:** the strongest memory-adjacent offload for task state. Memory
  (TIM/hmem) keeps lessons/decisions/errors; beads keeps work items. Don't
  cross the streams.

### Serena (oraios) — symbol-level ops
MIT. LSP-backed MCP: find_symbol, find_references, symbol-level edits, 40+ languages.

- **Adds:** replaces grep-and-read-whole-file loops with one semantic call.
- **Conflicts:** overview generation — scout owns the repo map; use Serena only
  for symbol-level questions, or you'll pay for two scans of the same code.
- **Verdict:** worth it on large codebases; skip on small ones (LSP startup
  overhead outweighs savings).

### caveman (JuliusBrussee) — output compression
MIT. The original. `o9k-caveman` is an adaptation of it, tuned to compose with
the other pillars (shared exception list, arbitration-aware).

- **Conflict:** installing BOTH upstream caveman and `o9k-caveman` = two style
  owners. Pick one. Upstream also ships `/caveman-stats` and
  `/caveman-compress` — usable alongside `o9k-caveman` if you keep only its
  skill disabled.

### codesight / aider repo-map / ast-grep — structure extraction
Feed the `scout` pillar: codesight generates a `CONTEXT.md` repo profile
(claimed 9–13× cheaper than raw exploration); ast-grep answers structural
queries. Scout's rule stands: ONE overview per session, whichever tool builds it.

### LLMLingua (Microsoft) — input compression
Research-grade prompt compression (up to 20×) via a small scoring model. No
Claude Code integration; only relevant if you build a custom preprocessing
pipeline. o9k's stance: not loading irrelevant context (scout) beats
compressing it after the fact — revisit if a turnkey MCP wrapper appears.

## Known-bad combinations

- **Two memory MCPs** (TIM + hmem, or either + mem0/claude-mem): double
  SessionStart injection, split-brain state. One only.
- **Two output styles** (o9k-caveman + upstream caveman, or + a persona pack).
- **Three overview generators** (codesight + Serena onboarding + repo-map) on
  the same repo in the same session.
- **superpowers plans + beads + memory Next-Steps** all tracking the same work.
