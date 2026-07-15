---
name: framework-scout
description: "GitHub Scout for agent frameworks. Use when asked to find, evaluate, or triage new Claude Code / AI-agent frameworks, MCP servers, or plugins, or to refresh the o9k compatibility matrix. Tells the agent where to hunt, how to score a candidate, and how to classify it as symbiotic / orthogonal / blocking before proposing a bundle or matrix update."
---

# framework-scout — the GitHub Scout

The agent ecosystem moves weekly. This skill is a **repeatable recon loop**: go
out, find what's new, score it, and slot it into o9k's compatibility matrix —
without dumping raw search results into context. Think of it as a scout that
brings back a one-page report, not the whole map.

Scouting is expensive (many searches, many pages). Treat it like a `dispatch`
job: fan the searches out, keep only the shortlist, and **write findings to
memory** so the next session starts from the last scout, not from zero.

## When to run

- User asks "what's new / better than X?" or "find a framework for Y".
- Refreshing [docs/COMBINING.md](../../../../docs/COMBINING.md) or the README
  matrix.
- Before proposing a new companion bundle.
- **Not** every session — schedule it (weekly-ish). Recon has a cost; amortize it.

## Step 1 — Hunt (where to look)

Cast wide, in rough order of signal-to-noise:

1. **GitHub Topics** — the highest-density source. Search repos by topic:
   `claude-code`, `mcp`, `model-context-protocol`, `ai-agents`, `agentic-ai`,
   `token-optimization`, `claude-code-plugin`. Use the GitHub MCP
   `search_repositories` with queries like:
   - `topic:claude-code sort:stars`
   - `topic:mcp token OR context OR memory pushed:>2026-01-01`
   - `claude code skill OR plugin in:name,description,readme sort:stars`
2. **GitHub Trending / OSSInsight** — `WebFetch https://ossinsight.io/trending/ai`
   for real-time star-growth (raw Trending has known ranking noise; growth rate
   beats absolute stars for spotting the new thing).
3. **Anthropic plugin directory** — install counts are a strong quality prior
   (`claude.com/plugins`). A plugin with 100k+ installs is battle-tested.
4. **Awesome-lists** — `awesome-claude-code`, `awesome-ai-agents-*`,
   `awesome-mcp-servers`. Good for coverage, lagging on freshness.
5. **Changelogs & releases** — for tools already in the matrix, check
   `list_releases` / `get_latest_release` to catch a pivot (e.g. a memory tool
   that just added a SessionStart hook → now a blocking conflict).

Hand broad multi-page sweeps to a `dispatch` subagent; receive the shortlist,
not the transcript.

## Step 2 — Score (is it worth a matrix slot?)

For each candidate, answer six questions. Reject early — most fail #1 or #2.

| # | Signal | Reject if… |
|---|--------|-----------|
| 1 | **Concern** — which o9k concern does it claim? (memory · overview · symbols · plan · methodology · dispatch · output · docs · none) | Can't name one — it's not in scope. |
| 2 | **Alive** — last commit / release recency, open-issue responsiveness | Stale (no commits in ~6 months) or archived. |
| 3 | **Traction** — stars, install count, forks — as a *prior*, not proof | Fine to keep low-star if novel; note the risk. |
| 4 | **License** — MIT / Apache / permissive? | Copyleft or unclear → flag, don't bundle. |
| 5 | **Install mechanism** — `/plugin`, `claude mcp add`, npm/uvx CLI? | No clean install path → note as manual-only. |
| 6 | **Claim vs reality** — "90% token savings" etc. — is it measured or vibes? | Take numbers as hypotheses; verify with `/o9k-stats` before repeating them. |

Do **not** read the whole repo. Read the README's install + "how it works"
sections and the topic — that's enough to classify. (This is `scout` discipline
applied to recon itself.)

## Step 3 — Classify (slot into the matrix)

Map concern → verdict using the o9k arbitration table:

- **🟢 Symbiotic** — claims a concern o9k has no pillar for (docs, cost, review,
  methodology) or *feeds* a pillar (structure extractors feed scout). Install
  alongside; note any one-owner caveat.
- **⚪ Orthogonal** — touches no o9k concern at all. Safe by construction.
- **🔴 Blocking** — claims a concern a pillar owns (memory, overview, output,
  dispatch) or duplicates another companion's concern (two plan stores, two
  methodologies). One active owner only.

The tie-breaker question for every candidate: *"If I install this, do two things
now inject at SessionStart / rewrite output / build an overview / own the plan?"*
If yes → 🔴, and name which owner wins.

## Step 4 — Trial (measure before adopting, never on the live config)

A 🟢 verdict from a README is a *hypothesis*. Before a candidate goes into a
bundle (or gets recommended to the user as install-worthy), run it once in
isolation and replace the README claims with measured numbers. **The live
setup is never the test bench.**

### Isolation — pick the lowest rung that answers the question

1. **Rung 0 — standalone probe, no Claude integration at all.** The default
   for MCP servers. Start the server directly (`uvx <pkg>`, or the package in
   a throwaway venv), call its tools by hand (stdio JSON-RPC or the package's
   own CLI), capture raw output. Answers the two core questions — is the
   output compact? does it stay in its lane? — without registering anything.
2. **Rung 1 — sandboxed config.** Only when the actual Claude Code
   integration is the thing under test (hooks, SessionStart injection):
   `CLAUDE_CONFIG_DIR=/tmp/o9k-trial-<name>` and install the candidate into
   that sandbox, never into `~/.claude`. Teardown = delete the directory.
3. **Rung 2 — throwaway target repo.** Whatever repo the tool indexes/watches
   is a clone or fixture, never the live project — even a "read-only" indexer
   may drop dotfiles or caches into it.

### Measure — four numbers, captured not estimated

| # | Measurement | How |
|---|-------------|-----|
| 1 | **Footprint diff** | Snapshot sandbox config + target repo before/after (`find | sort` + checksums). Any new hooks, MCP entries, dotfiles? This is the collision check with evidence. |
| 2 | **Token profile** | Run the tool's main query, count tokens of the raw output, compare against the grep+read baseline for the same question. This decides whether a "scout-feeder" actually feeds or floods. |
| 3 | **Runtime cost** | What did it stand up — DB, daemon, watcher, build step? Check the process list before/after. |
| 4 | **Concern check** | Does observed behavior match the claimed concern, or did it quietly persist memory / inject context / rewrite output? |

### Verdict gate

- Numbers beat claims: the trial's measured token profile replaces the
  README's headline in the report and the matrix row.
- **Teardown is part of the trial**: prove the live `~/.claude` is
  byte-identical to before (snapshot diff), remove the sandbox and venv.
- A candidate that can't be trialed in isolation (install is irreversible,
  demands global state) — that itself is a finding: note it, don't adopt.

## Step 5 — Report & propose

Output a compact candidate report — **not** the raw findings:

```
CANDIDATE: <name> (<owner>/<repo>) — <stars>★, last commit <date>, <license>
CONCERN:   <o9k concern or "none">
VERDICT:   🟢/⚪/🔴 — <one-line rule>
INSTALL:   <plugin | mcp add | npx/uvx one-liner>
TRIAL:     <not run | measured: tokens vs baseline, footprint, runtime cost>
NOTE:      <claim to verify, or which owner it displaces>
```

Then, if it earns a slot:
1. Add a row to the matrix in `docs/COMBINING.md` (and the README table if
   headline-worthy).
2. If it belongs in a stack, add it to a bundle in
   [install/o9k-companions.sh](../../../../install/o9k-companions.sh) and
   [docs/BUNDLES.md](../../../../docs/BUNDLES.md).
3. Save the finding to memory (`memory` skill) so the next scout diffs against it.

## Anti-patterns

- **Don't** paste search results or full READMEs into context — classify, keep
  the verdict line.
- **Don't** trust a token-savings headline — mark it "unverified" until a
  Step 4 trial measured it.
- **Don't** install a candidate into the live `~/.claude` to "just try it" —
  that's what the trial sandbox is for.
- **Don't** bundle a 🔴 framework next to the pillar it collides with — a bundle
  must be internally conflict-free.
- **Don't** scout every session — it's a scheduled recon, not a per-turn habit.
