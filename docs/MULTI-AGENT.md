# Multi-Agent Delegation

Running a multi-CLI agent team (Claude Code, Codex, Cursor, OpenCode, Hermes)
with role-based model selection is **not** an o9k feature. It lives in the
standalone [team-up](https://github.com/Bumblebiber/team-up) package.

```bash
npm i -g team-up && team-up init
```

o9k ships none of that runtime. What it does is arbitrate the concern: once a
team-up roster exists, o9k's `dispatch` skill makes the mailbox protocol
**mandatory** for external CLI workers. That contract is the only thing this
page still owns.

## What team-up covers

Roster registry, deterministic `pick`/`dispatch`, limit watch, the subscription
usage collector, score refresh, session-limit handoff, the plan→implement→review
pipeline, and cross-CLI mailbox runs with reboot resume. Its own README and
`roster` skill are the reference — this page deliberately does not mirror them,
because a copy would drift.

## The one o9k rule: Path B is not optional

`dispatch` has two paths:

- **Path A** — in-host subagents (searches, digests, lookups). Always available,
  no roster needed. Single-agent users stay here and can ignore the rest.
- **Path B** — an **external** CLI process the parent will not drive turn by
  turn. Applies once team-up is installed and a roster exists.

A Path B spawn is complete only with all three:

1. a mailbox run id from `team-up runs create …`
2. the worker started via `team-up dispatch --run-id <id> …`
3. a cheap in-host watcher blocking on `team-up runs wait <id>`

Bare `team-up dispatch` without mailbox and watcher is an **incomplete spawn**:
the parent goes silent while tmux sits idle or stuck, and nobody notices. Never
report "it's running" to the human before the watcher exists.

Detection, before any external spawn:

```bash
command -v team-up && test -f ~/.team-up/roster.json
```

No roster → Path A only. Never invent Path B for a machine that has no roster.

## Model choice

Dispatch decides *whether* to delegate; team-up decides *who* does it. Map the
task to a role and let `team-up dispatch` resolve the model — never pick one by
vibe, and never hard-code a model name in a prompt or skill.

Full contract: the `dispatch` skill (§ Incomplete-spawn gate) and team-up's
`roster` skill (§ Cross-CLI runs).
