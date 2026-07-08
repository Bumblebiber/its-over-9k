# Changelog

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
