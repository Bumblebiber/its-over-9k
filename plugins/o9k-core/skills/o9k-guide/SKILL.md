---
name: o9k-guide
description: "Personalized o9k orientation for the human. Use when the user invokes /o9k-guide, asks how o9k works or what they need to do, right after first-time setup, or when the SessionStart hook flags an unresolved arbitration. Explains what runs automatically, the few one-time actions left, and the optional commands."
---

# o9k-guide — The One-Minute Orientation

o9k's promise to the human: **you don't have to do or know anything — the agent
runs it.** This guide covers the small remainder that automation can't do, and
only that. Personalize it: run the detector first, then tell the user only what
applies to *their* setup.

## Step 1 — detect the actual setup

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/o9k-guide.mjs"
```

Read-only, instant. Gives you: installed pillars, memory backend, detected
companions, open arbitrations, gaps.

## Step 2 — present the guide

Match the user's language. Keep it to ~a screen. Structure:

**1. "Runs by itself" (always say this first).** One short paragraph: the agent
compresses its output, loads only the code it needs, offloads noisy searches,
and saves state to memory before anything is lost — automatically, every
session, via hooks. There is nothing to invoke and nothing to learn.

**2. "One-time actions" (only the ones the report flags).** The full list of
things automation genuinely can't do — omit every line the report shows as
already done:

| Gap in report | Tell the user |
|---------------|---------------|
| No memory backend | Run `npm i -g hmem && npx hmem init` once — without it, sessions start from zero. |
| Missing pillar(s) | `/plugin install <name>@o9k` for each. |
| dispatch × superpowers arbitration | Two dispatch owners are active. Say which to disable and offer to do it for them. |
| Two memory backends | Say which one wins (TIM) and offer to remove the other. |
| Wants the companion stack | `install/o9k-companions.sh recommended` (dry run first — the companion-bundles skill handles it). |

Whenever a fix is something you can execute (an install command, a config
edit), **offer to do it right now** — the user should never have to copy-paste.

**3. "Optional, when curious" (max 5 lines).**
- `/o9k-stats` — proof the savings are real, measured from session logs.
- `/o9k-update` — check pillars & companions for updates, apply the safe ones.
- `/o9k-guide` — this orientation, any time.
- `framework-scout` skill — scouts GitHub for new companion frameworks.
- Settings, only if asked: `O9K_UPDATE_CHECK=off|notify|auto` (update policy),
  kill switches `O9K_CORE_HOOK=off`, `O9K_MEMORY_HOOK=off`.

## Rules

- **Never** dump this whole file at the user — the report decides what's said.
- A fully-green report = three sentences: everything runs by itself, nothing to
  do, `/o9k-stats` shows the effect. Done.
- Don't repeat the orientation unprompted; the SessionStart hook offers it once
  after install, after that only on demand or when a new arbitration appears.
