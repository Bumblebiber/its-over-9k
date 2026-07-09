---
name: o9k-stats
description: "Token usage report for the current project from Claude Code session transcripts. Use when the user asks how many tokens were used/saved, invokes /o9k-stats, or wants to verify the o9k pillars are paying off."
---

# o9k-stats — Measure It

Run the bundled analyzer against the current project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/o9k-stats.mjs"
```

(Optionally pass a different project directory as the first argument.)

Present the output compactly (caveman rules apply). Interpretation guide:

- **output share of total traffic** — the lever `caveman` pulls. Uncompressed
  agents typically sit noticeably higher; falling share across sessions =
  compression working.
- **avg output/turn** — watch the trend, not the absolute: it should drop after
  enabling `o9k-caveman` (upstream caveman reports ~50–65% output reduction).
- **cache read vs fresh input** — high cache-read share is healthy (stable
  context prefix); lots of fresh input suggests context churn — check `scout`
  discipline and whether something regenerates the repo map every turn.

Limits (be honest about them): transcripts only cover Claude Code sessions on
this machine; subagent traffic is attributed to its own transcript; there is no
counterfactual baseline — for a before/after comparison, compare sessions from
before the o9k install date with sessions after.
