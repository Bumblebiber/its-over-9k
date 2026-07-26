<!-- o9k-provenance
who: codex:gpt-5
when: 2026-07-25T12:16:48Z
why: Add specialist-persona isolation guardrails before handoff
trigger: Falls etwas davon potenziell mit deiner Review kollidieren könnte, passe diese noch an
host: codex
-->
<!-- o9k-provenance
who: codex:gpt-5
when: 2026-07-25T12:01:36Z
why: Add approved self-improving sandbox evaluation loops
trigger: Arbeite einen Self Improving Loop aus und nimm das in deine Review auf
host: codex
-->
<!-- o9k-provenance
who: codex:gpt-5
when: 2026-07-25T11:48:17Z
why: Critical review of predecessor essay with repository cross-checks
trigger: Read HANDOFF.md and continue the task it describes
host: codex
-->
# Critical Review: “When the Efficiency Framework Becomes the Bloat”

**Verdict:** **Revise.** Approve the direction—progressive disclosure, one owner per concern, and verified same-host deduplication—but reject several proposed merges. The essay currently moves from an unattributed 40–70k session total to a skill-consolidation architecture without proving that skill exposure is the dominant cost.

## Evidence checked

- Repository inventory: 16 `SKILL.md` files, 88,017 bytes total.
- Their 16 one-line frontmatter descriptions total 6,399 bytes. Bodies are mostly lazy-loaded; disk size is not session-start context.
- `o9k-init` is the largest body at 19,662 bytes, but its description is 344 bytes.
- Current `session-start.mjs` output on this machine is 697 bytes. The core hook is therefore not a plausible explanation for an additional 20–30k tokens by itself.
- `docs/COMBINING.md` defines the default o9k install as all five pillars. `minimal`, `recommended`, and `max` in `docs/BUNDLES.md` are companion bundles. The essay currently blurs these two packaging axes.
- One verified same-host naming duplicate exists in the installed shared catalog: `caveman` appears at both `~/.agents/skills/caveman/` and `~/.agents/skills/o9k/caveman/`. The essay’s `o9k-guide` / `o9k-o9k-guide` example was not reproduced by this check.

## Critical findings

### 1. Measurement must precede redesign

The essay groups system prompts, skill descriptions, MCP schemas, hooks, and duplicated surfaces under one 40–70k observation, then recommends skill merging. That does not establish causality.

Required correction:

1. Capture context composition per host and configuration.
2. Attribute bytes or tokens to system prompt, catalog descriptions, MCP schemas, hook output, memory injection, and user/project rules.
3. Run controlled ablations.
4. Redesign the largest measured source first.

The current o9k evidence points to a hard upper bound of roughly 6.4KB for all repository skill-description lines before host wrapping. Removing every admin/recon description would save only about 2.9KB. That may help routing, but it cannot explain or repair a 20–30k increase.

### 2. Keep contracts separate; consolidate exposure

The essay correctly rejects a mega-skill, then proposes three smaller mega-skills:

- doctrine = `using-o9k` + `caveman` + `scout`
- roster = roster + refresh + pass-to
- recon = framework scouting + bundle installation + benchmarking

These operations have different triggers, safety boundaries, and failure modes. Loading one combined body after any matching trigger can cost more than the current lazy files and make routing less precise.

Better rule: consolidate manifests, packaging, shared code, and tiny routing shims—not behavioral contracts.

### 3. Define layers by exposure mechanics

The proposed layers mix concern type with activation frequency. For example, memory is called runtime-triggered even though project briefing runs at session start.

Use these exposure classes instead:

| Exposure class | Meaning |
|---|---|
| Injected | Bounded directive automatically present at session start |
| Catalog-visible | Short discriminative description; detailed body lazy-loaded |
| Explicit command | Human invokes a stable command or thin shim |
| External documentation | Maintainer detail absent from normal agent context |

This taxonomy maps directly to token cost and host behavior.

### 4. Clarify dispatch/roster ownership

Path B applies only when work is delegated to an external CLI/tmux worker and roster support is configured—not merely because `roster.json` exists.

Recommended ownership:

- `dispatch`: decides whether to delegate; owns cost gate, Path A result contract, and the requirement that external spawns are incomplete without callback/watcher.
- `roster`: deterministically selects and launches the external worker; owns mailbox state transitions and run lifecycle.
- watcher completion: one explicit protocol shared by both documents, sourced from one machine-readable definition.

### 5. Do not shorten descriptions blindly

Descriptions are routing interfaces. Removing distinctive trigger language can increase missed activations or hide mandatory safety gates. Optimize them against:

- token size
- false-positive activations
- false-negative activations
- preservation of hard contracts

`dispatch` and `roster` descriptions should retain the mailbox/watcher and external-worker conditions even if they remain among the longest.

### 6. Separate cross-host replication from same-host duplication

Claude, Cursor, Codex, and other hosts may require different wrappers, symlinks, or formats. Those copies do not multiply one session’s context unless a single host discovers more than one copy.

Deduplicate only after capturing each host’s effective discovery inventory. Migration must also remove stale aliases and old copies; otherwise consolidation temporarily increases exposure.

## Consolidation decisions

| Item | Decision | Reason |
|---|---|---|
| `dispatch` | **Keep** | Distinct delegation and completion contract |
| `memory` | **Keep** | Distinct backend/session lifecycle |
| `roster` | **Keep** | Deterministic external-worker selection and run lifecycle |
| `pass-to` | **Keep separate trigger** | Manual session handoff, not a Path B worker |
| `roster-refresh` | **Move to admin exposure** | Periodic maintenance, not runtime selection |
| `using-o9k` | **Change** | Keep tiny router/arbitration face; source rules from shared manifest |
| `caveman` | **Keep contract separate** | Global style plus safety exceptions |
| `scout` | **Keep contract separate** | Search/read discipline has distinct triggers |
| guide/init/update/stats | **Change packaging, not merge bodies** | Thin stable commands; detailed admin logic off hot path |
| framework-scout/bundles/bench | **Reject body merge** | Different approval, ordering, and evidence requirements |
| Serena and other companions | **Keep optional** | Preserve one-owner boundaries |
| `md-provenance` | **Add to taxonomy** | Current essay omits a runtime skill/hook |

## Missing failure modes

- A merged body loads all modes after one trigger and raises task-time context.
- Host resolvers do not support nested modes, dynamic catalogs, or lazy sections.
- Renames leave stale copies and expose both old and new skills.
- A single router becomes stale or a truncation/corruption point.
- Short descriptions stop activating safety-critical skills.
- Admin consolidation mixes read-only status with mutating install/update actions.
- Minimal installs remove their own repair/discovery path.
- MCP schemas dominate the total, making skill restructuring immaterial.
- Short sessions regress even if long sessions improve.
- Cached-input cost, context occupancy, attention interference, latency, and task success move differently.
- The proposed `o9k-recon scout` name collides conceptually with codebase `scout`.

## Smallest shippable slice

No current evidence supports a small skill merge that will **meaningfully** reduce a 40–70k start. The smallest honest slice is measurement plus verified deduplication:

1. Add a read-only context inventory that reports, per host:
   - effective discovered skill names and paths
   - duplicate same-host names
   - description bytes/tokens
   - SessionStart hook output bytes/tokens
   - MCP server/tool-schema bytes/tokens where the host exposes them
2. Add a fixed token budget test for the generated SessionStart directive.
3. Remove only confirmed same-host duplicate exposures, beginning with the duplicated installed `caveman`.
4. Re-measure.
5. Target the largest attributed bar. If MCP schemas dominate, gate server registration; if catalog descriptions dominate, move admin/recon to thin command shims; if memory injection dominates, reduce its briefing budget.

Expected result from skill-description cleanup alone: modest—likely hundreds, not tens of thousands, of tokens. The essay should state this ceiling explicitly.

## Self-improving evaluation system

The redesign should not be a one-off cleanup. It should run as a gated optimization system that repeatedly creates a fresh agent environment, measures it, challenges its routing behavior, tests one candidate change, and produces a promotion packet for a human. The loop may mutate and test autonomously inside the sandbox; it must never promote to the main configuration without explicit human approval.

### Governing principles

1. **Fresh means fresh:** isolated `HOME`, host config, plugin cache, memory store, repository copy, process namespace, and run ID. Network is off unless the task explicitly requires it.
2. **One candidate, one hypothesis:** each experiment changes one exposure variable or one coherent contract. Mixed changes destroy causal attribution.
3. **Self-report is diagnostic, not evidence:** ask agents about confusion, but score their actual choices and outcomes.
4. **No single optimization score:** use hard safety/quality gates plus a Pareto comparison across context, routing, task success, latency, and cost.
5. **Holdouts stay hidden:** candidate generation must not see every evaluation prompt, or the loop will optimize for the benchmark rather than general behavior.
6. **Every result is reproducible:** persist code/config hash, host, model, effort, tokenizer, task-set hash, seed, environment inventory, raw trace, and metric schema.
7. **Human promotion only:** the loop recommends `promote`, `reject`, or `inconclusive`; only a human may apply the winning patch to the main configuration.

### Outer improvement loop

1. Freeze the current approved baseline and its benchmark manifest.
2. Diagnose the largest measured cost or routing failure.
3. Generate one minimal candidate patch in a disposable sandbox.
4. Start fresh agents for baseline and candidate under identical conditions.
5. Run the specialized loops below, cheapest first.
6. Reject immediately on a hard regression.
7. Compare surviving candidates on a Pareto frontier instead of a single weighted score.
8. Produce a human-readable promotion packet: hypothesis, diff, measurements, regressions, representative traces, confidence, and rollback path.
9. Human chooses promote, revise, or discard.
10. A promoted candidate becomes the next baseline; discarded candidates remain recorded to prevent repeated failed experiments.

### Loop A — Context footprint

Purpose: identify what is actually present before task work begins.

For each fresh agent:

- capture effective system/developer/project instructions
- enumerate visible skill names, descriptions, duplicate paths, and loaded bodies
- enumerate visible MCP servers, tools, and schema bytes/tokens
- capture every SessionStart injection separately
- record context-window occupancy, cached-input accounting, time to first usable turn, and host wrapping overhead
- repeat after the first skill load and after a representative task to measure context growth

Outputs:

- source-attributed context ledger
- same-host duplicate report
- baseline/candidate delta
- uncertainty marker for sources the host cannot expose

This loop is deterministic where raw bytes are available. It should not rely on an agent estimating its own context size.

### Loop B — Routing confusion

Purpose: measure whether the catalog creates ambiguous or incorrect choices.

Use a two-stage probe:

1. Give the fresh agent unprimed scenarios such as code search, symbol lookup, past-session recall, external worker spawn, package update, framework discovery, and manual handoff. Record its first chosen skill/tool and rejected alternatives.
2. After the choice, ask for confidence, competing candidates, and any contradictory instructions it noticed.

Score against a machine-readable ownership oracle:

- correct first route
- unnecessary skill activations
- missed mandatory gates
- duplicate-owner selection
- calibration: confidence versus correctness
- contradiction detection
- time/tool calls before first productive action

The self-reported confusion answer is useful only when compared with the trace. A confident wrong route is worse than an admitted ambiguity.

### Loop C — Behavioral task performance

Purpose: ensure a smaller start context still produces better work.

Reuse `benchmarks/run-bench.sh` and `benchmarks/tasks/MANIFEST.json` as the execution kernel. Expand scoring beyond binary task completion:

- task correctness
- total and peak context
- input, cached-input, and output tokens
- latency and tool-call count
- repeated exploration
- unnecessary full-file reads
- missed memory lookup
- false or missed dispatch
- incomplete Path B spawn
- command discoverability
- recovery after a missing optional component

Compare complete sessions, not only SessionStart. A candidate that saves 800 startup tokens but causes 3,000 tokens of re-exploration loses.

### Loop D — Controlled ablation

Purpose: establish causality.

Run baseline versus exactly one mutation:

- remove one duplicate exposure
- shorten one description
- hide one admin skill behind a command shim
- defer one MCP server or tool family
- reduce one memory briefing budget
- alter one routing directive

Use the same host, model, effort, task hash, seeds, and repeat count. Keep only candidates whose improvement survives repeats and does not regress hard gates. Then test interactions pairwise; two individually good changes may conflict when combined.

### Loop E — Collision and fault injection

Purpose: test the failure modes normal benchmarks rarely trigger.

Create adversarial sandboxes containing:

- duplicated skill names at multiple discovery paths
- stale aliases after a rename
- two tools claiming the same concern
- missing TIM, roster, Serena, or benchmark dependency
- unavailable MCP server
- malformed or oversized SessionStart output
- interrupted mailbox worker
- old and new plugin versions installed together
- network denied during an operation that should remain local

The agent must identify the conflict, choose one owner, degrade safely, avoid destructive repair, and explain what needs human approval.

### Loop F — Long-session amortization

Purpose: prevent optimization for short synthetic sessions only.

Run multi-turn tasks that require orientation, implementation, debugging, handoff, and resumed work. Measure:

- break-even turn where startup overhead is recovered
- context growth per turn
- compaction frequency
- memory retrieval quality after compaction
- repeated loading of the same skill bodies
- whether early routing rules continue to influence later decisions

Report separate results for short, medium, and long sessions. One profile may not dominate all three.

### Optional Loop G — Variant tournament

Use only after the measurement and comparator are trustworthy. Generate several independent variants—such as a shorter router, command shims, or different MCP exposure policies—and run them against identical visible and hidden tasks.

Do not collapse results into one score. Present the Pareto frontier:

- lowest startup context
- best routing accuracy
- lowest complete-session tokens
- best task success
- lowest latency

The tournament nominates candidates; it never promotes them.

### Promotion gates

A candidate may be shown as `promote` only when:

- no safety or approval-boundary regression occurs
- task success does not decline
- routing accuracy does not decline
- no new incomplete-spawn, duplicate-owner, or repair-path failure appears
- at least one material metric improves across repeated runs
- the improvement also appears on a hidden holdout
- raw artifacts and rollback instructions are complete

Otherwise the result is `reject` or `inconclusive`. A smaller context alone is insufficient.

### Operating cadence

| Cadence | Loops | Purpose |
|---|---|---|
| Per candidate | A + B + targeted D | Fast footprint and routing pulse |
| Pre-merge | A + B + C + D | Full baseline/candidate regression check |
| Nightly or scheduled | C + F | Broader task and long-session stability |
| Pre-release | A–F | Cross-host, collision, and fault-injection gate |
| Major redesign | A–G | Controlled exploration of multiple architectures |

### Reuse and missing infrastructure

Reuse:

- `benchmarks/run-bench.sh` for isolated repeated task execution
- `benchmarks/tasks/MANIFEST.json` for versioned task identity
- `benchmarks/results/SCHEMA.md` for result persistence
- `plugins/o9k-dispatch/skills/dispatch/evals/evals.json` as the first routing corpus
- `plugins/o9k-roster/scripts/runs.mjs` and `roster.mjs` for durable external-worker orchestration
- `plugins/o9k-core/scripts/o9k-stats.mjs` for transcript token aggregation

Still required:

- real OS/process/filesystem/network sandboxing; isolated config and temporary clones are not sufficient
- a generic skill-eval runner
- a baseline/candidate comparator with hard gates and confidence handling
- hidden and adversarial task sets
- unique run directories with retained stdout/stderr and environment inventories
- the mutation → execute → compare → recommend controller
- scheduled/manual CI entry points; production promotion remains manual

### First implementation increment

Build only the non-mutating core first:

1. Fresh-agent sandbox launcher with isolated `HOME`, config, cache, memory, repository, timeout, and run ID.
2. Context-footprint collector.
3. Routing-confusion probe runner.
4. Baseline/candidate result comparator.
5. Human-readable promotion packet that cannot apply changes.

Only after this layer is trustworthy should the system generate candidate patches automatically. This sequencing prevents an unmeasured optimizer from rewriting the measurement system that judges it.

### Specialist personas: compatible only through context isolation

Named specialists can extend the roster from “which model runs?” to “which capability package runs?” and may become a direct remedy for catalog bloat. They become a regression if installing ten specialists exposes ten skill catalogs and ten MCP tool families to every normal session.

Required constraints:

- The parent sees only a tiny specialist index: stable ID, display name, remit, non-remit, version, and supported call types (`consult`, `delegate`, `review`).
- Full prompts, skills, MCP schemas, and frameworks are materialized only inside the selected specialist’s fresh worker sandbox.
- Specialist packages are not copied into every host’s global skill-discovery path.
- The roster selects specialists deterministically from task contracts; the human-readable persona name never replaces the machine-readable capability manifest.
- Specialist-to-specialist calls use the existing mailbox/run protocol with depth, cycle, time, and token limits. The parent remains responsible for final integration.
- Every specialist declares filesystem, network, command, MCP, and approval requirements before launch.
- Versions are pinned. External repositories require checksums or signed releases, trust tiers, explicit install/update approval, and rollback metadata.
- Each specialist repository ships its own visible and hidden evals. Pull requests must pass that specialist’s suite plus cross-specialist routing and collision tests through the self-improving loop above.

One repository per specialist is therefore a distribution option, not the runtime architecture. The safe runtime architecture is a dormant package registry plus on-demand sandbox materialization. Otherwise the proposed employee ecosystem recreates the exact flat-visibility and supply-chain problems this review is trying to remove.

## Recommended rewrite

Keep the essay’s thesis but change its prescription:

> o9k’s likely problem is not file count but unmeasured exposure. Measure each host’s effective context, preserve sharp contracts, and reduce the largest hot surface through progressive disclosure. Consolidate ownership and metadata first; merge behavioral bodies only when one trigger, one safety boundary, and measured savings justify it. Treat every redesign as a sandboxed experiment: fresh agents, attributed context, routing and task evals, controlled ablations, adversarial collisions, retained evidence, and human-only promotion.

## Final decision

- **Approve as direction:** progressive disclosure, bounded SessionStart routing, one-owner arbitration, minimal optional companions, same-host deduplication.
- **Require revision:** causal attribution, exposure taxonomy, default-vs-companion packaging language, evaluation metrics.
- **Reject:** merging doctrine bodies, merging pass-to/refresh into roster runtime, and merging scouting/install/benchmark workflows into one recon body.
- **Add as operating model:** continuous sandboxed measurement and improvement loops with fresh agents, hidden holdouts, reproducible artifacts, hard regression gates, and mandatory human promotion.
