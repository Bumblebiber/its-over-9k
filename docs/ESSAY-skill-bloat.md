<!-- o9k-provenance
who: cursor:grok-4.5
when: 2026-07-25T11:37:12.823Z
why: unspecified
trigger: afterFileEdit
host: cursor
-->
# When the Efficiency Framework Becomes the Bloat

**Status:** draft for review  
**Date:** 2026-07-25  
**Context:** o9k session-start measurements (~40k base, ~60–70k with SessionStart hooks) and growing skill/tool surface

---

## 1. The paradox

o9k exists to maximize the fraction of the context window that does useful work. Every token loaded or emitted is re-read on later turns; waste compounds. The doctrine is simple: load less, say less, isolate noisy work, persist before context dies.

And yet the system that encodes that doctrine has itself become heavy. A fresh session can open with tens of thousands of tokens already spent—before the human’s first real task begins. Skills, rules, MCP schemas, companion stacks, and host wiring accumulate. What was meant to keep agents lean starts to look like the opposite of its goal.

This is not a failure of intent. It is a structural tension that shows up whenever process knowledge is packaged as always-visible tools. **Skills are levers for efficiency; too many simultaneous levers are ballast and noise.**

The hopeful story is still true in part: a costly start can pay off in a long session if routing is correct—if the agent stops re-exploring, stops duplicating owners, and stops dumping search noise into the main thread. The unhopeful story is also true: if the agent cannot tell which lever to pull, the start tax buys confusion instead of leverage, and the session pays twice.

---

## 2. What “too many tools” actually means

Three different problems get bundled under one complaint. They need separate diagnoses.

### 2.1 Token tax at session start

Measured roughly: ~40k before task work; ~60–70k once SessionStart hooks run. That number is rarely “all skill bodies loaded.” Hosts typically inject:

1. **System / product prompt** — fixed host cost.
2. **Skill catalog descriptions** — every installed skill’s frontmatter `description` is candidate context even when the body is lazy-loaded.
3. **MCP tool schemas** — every connected server (memory, symbols, telegram, …) advertises parameters.
4. **Hooks and injected doctrine** — SessionStart text, inventory, arbitration flags, update notices.
5. **Duplicated surfaces** — the same o9k skill mirrored as Claude skill, Cursor rule, and Agents skill; naming collisions such as `o9k-guide` beside `o9k-o9k-guide`.

o9k’s own plugin tree today is on the order of ~16 `SKILL.md` files (~88KB on disk). That is not huge as documentation. Multiplied across hosts and companions, and sitting next to large admin skills (`o9k-init` alone is ~20KB), it becomes a catalog the model must navigate every turn.

### 2.2 Choice paralysis

Token cost is measurable. Selection cost is worse when invisible. An agent facing caveman, scout, dispatch, roster, memory, recon, guide, init, update, stats, Serena, beads, superpowers, and host-native tools does not automatically apply the arbitration table. It approximates. Approximation errors look like: grepping instead of symbol lookup, exploring inline instead of dispatching, inventing a model pick instead of calling roster, or loading two overview builders for one question.

**Too many tools do not only fill the window; they degrade decision quality**, which then burns more of the window.

### 2.3 Product sprawl vs. runtime doctrine

Not every skill belongs in every session. o9k currently mixes three jobs in one flat list:

| Layer | Job | Examples |
|-------|-----|----------|
| **A — Doctrine** | Always-on rules of engagement | using-o9k, caveman, scout core |
| **B — Runtime** | Triggered during real work | dispatch, memory, roster |
| **C — Admin / recon** | Install, orient, update, discover | init, guide, update, stats, framework-scout, bundles, bench, roster-refresh |

Layer C is essential for humans and for maintainers. It is optional for a coding agent mid-feature. Shipping A+B+C into every default install is how an efficiency framework becomes a monster.

---

## 3. Why consolidation is not “just merge everything”

Naïve merging (“one mega-skill”) fails for the same reason naïve companion stacking fails: different triggers, different owners, different failure modes.

- **dispatch** has a hard contract (RESULT-only, cost gate, Path A vs Path B). Folding it into prose doctrine invites incomplete spawns.
- **memory** is backend-shaped (TIM/hmem lifecycle, flush-before-clear). It is not an output style.
- **roster** is deterministic code selection plus mailbox runs. Judgment-based model picking is exactly what it forbids.
- **Admin flows** (init/guide) are long, branching, human-facing. Loading them on every coding turn is pure tax.

The design target is not fewer files for aesthetics. It is **fewer always-visible choices** and **clear ownership**, with progressive disclosure for the rest.

---

## 4. Proposed direction: three layers, fewer faces

### 4.1 Layer A — Doctrine (always-on, tiny)

Collapse the always-on surface into one SessionStart directive (plus one short skill body if hosts require a skill object):

- Output compression (caveman rules)
- Context ladder (memory → map → search → narrow read)
- One-owner-per-concern arbitration table (compressed)
- Pointer: “for spawn / memory flush / admin, load the matching runtime or admin skill”

Budget instinct: hundreds of tokens injected, not thousands of overlapping descriptions.

**Merge candidates:** `using-o9k` + `caveman` + core of `scout` → single doctrine unit.

### 4.2 Layer B — Runtime (trigger-gated)

Keep separate skills (or one skill with strict sections) only where the trigger is sharp:

- **dispatch** — broad search, lookup, digests, decomposable fan-out; Path B when `roster.json` exists
- **memory** — session briefing, past references, pre-compaction flush
- **roster** — role/model selection, limit handoff, pass-to, cross-CLI mailbox (with refresh/pass-to as subcommands, not peer skills in the catalog)

Agents should see **three runtime doors**, not a dozen peer pillars.

### 4.3 Layer C — Admin (opt-in package)

Move human/maintainer workflows out of the default coding session surface:

- One **`o9k` admin skill** with modes: `guide | init | update | stats`
- One **`o9k-recon` skill** with modes: `scout | bundles | bench`
- Install path: default **minimal** (doctrine + runtime); admin/recon as explicit add-on or marketplace group

The human still gets `/o9k-init` and friends; the coding agent mid-task does not carry their descriptions by default.

---

## 5. Consolidation map (concrete)

| Keep separate | Merge into | Rationale |
|---------------|------------|-----------|
| dispatch | — | Distinct spawn contract |
| memory | — | Distinct backend lifecycle |
| roster (+ refresh, pass-to as subcommands) | one roster face | Same concern: who runs where |
| using-o9k, caveman, scout core | doctrine | Always-on, overlapping “how to behave” |
| guide, init, update, stats | `o9k` admin modes | Human ops, rare in coding turns |
| framework-scout, companion-bundles, bundle-bench | `o9k-recon` modes | Maintainer recon, not runtime |
| Companions (Serena, beads, …) | stay companions | Optional; not o9k pillars; default install stays minimal |

**Do not merge** Serena into scout: overview vs symbols must remain one-owner-per-lookup. Consolidation of *catalog faces* is not consolidation of *concerns*.

---

## 6. Faster wins without a full redesign

These reduce pain before any skill merge ships:

1. **Deduplicate host surfaces** — one install path per host; eliminate `o9k-*` / `o9k-o9k-*` doubles and triple mirrors where the host already loads plugin skills.
2. **Shorten frontmatter descriptions** — descriptions are the always-hot catalog; bodies can stay detailed and lazy.
3. **Default bundle = minimal** — recommended/max become explicit upgrades after `/o9k-guide`.
4. **SessionStart = routing card** — inventory + open arbitrations + “which door,” not a second copy of every skill.
5. **Measure** — attribute the 40–70k: host prompt vs skill descriptions vs MCP schemas vs hooks vs companions. Fix the largest bar first.

---

## 7. Risks and open questions

- **Discoverability:** If admin skills leave the default catalog, humans must still find `/o9k-init` after install (guide once, docs, marketplace groups).
- **Host limits:** Some hosts list all skills flat; “modes” only help if the host does not expand every mode description anyway.
- **Regression of doctrine:** Merging caveman into using-o9k must not soften the standing order that compression applies every turn.
- **Companion creep:** Slimming o9k while `recommended` still pulls Serena + beads + superpowers can recreate the monster outside the pillars. Bundle policy is part of the fix.
- **Proof:** We need before/after session-start token measurements and a small behavioral eval (does the agent still dispatch / still avoid dual overview owners?).

---

## 8. Closing claim

o9k’s problem is not that skills exist. Skills are how we encode process without re-deriving it every session. The problem is **flat visibility**: doctrine, runtime, and admin compete in the same catalog, multiplied across hosts and companions, until the efficiency framework spends the context it was built to protect—and until the agent can no longer tell which tool is the right one.

The fix is progressive disclosure with sharp ownership: **one small always-on doctrine, few trigger-gated runtime doors, admin/recon off the default hot path**, plus ruthless deduplication of how those faces are installed into hosts.

Fewer faces. Same concerns. Clear owners. Measure the start tax until it shrinks.

---

## Appendix — review prompts for the next reader

1. Which merges are wrong (would blur contracts or owners)?
2. Is three layers the right cut, or should runtime collapse further (e.g. dispatch+roster)?
3. What is the smallest shippable slice that would move session-start tokens meaningfully?
4. What did this essay underweight (host quirks, MCP schema cost, companion default, human UX)?
