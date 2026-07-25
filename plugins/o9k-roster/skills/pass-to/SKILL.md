---
name: o9k-pass-to
description: "Manual session handoff to a named model in its native CLI (tmux). Use when the user invokes /o9k-pass-to, says pass to <model>, hand off to opus/composer/codex/hermes, or wants to continue this session in another harness with a TIM + HANDOFF.md checkpoint. Not for automatic limit handoff (that is roster handoff --role) and not for Path-B mailbox workers."
disable-model-invocation: true
---

# o9k-pass-to — Manual model handoff

You are the **outgoing** main agent. The human asked to continue in another
model's native harness. Do the limit-handoff ritual, but **pin their model** —
do not walk a role chain, do not wait on a mailbox watcher.

**Prerequisite:** `~/.o9k/roster.json` (CLI templates). If missing → say so and
stop; suggest `/o9k-init` roster setup.

`ROSTER="node <marketplace>/plugins/o9k-roster/scripts/roster.mjs"`
(Claude Code plugin: `node "${CLAUDE_PLUGIN_ROOT}/scripts/roster.mjs"`).

## Auto-approve flags (required for tmux)

Detached tmux has no human on the TTY for permission prompts. The spawned
harness **must** run fully auto-approved via `clis.*.cmd` in
`~/.o9k/roster.json`:

| CLI | Required flag(s) in `cmd` (before `{model}` / `{prompt}`) |
|---|---|
| `claude` | `--dangerously-skip-permissions` |
| `cursor` | `--yolo` (alias of `--force`) |
| `codex` | `--yolo` if supported; else `--dangerously-bypass-approvals-and-sandbox` (or `-a never`) |

Before `$ROSTER pass-to`, skim those `cmd` arrays. If a flag is missing → fix
`roster.json` (or tell the human), then spawn. Without these flags the worker
blocks on approvals and the handoff looks "hung".

## Argument

User form: `/o9k-pass-to <Modellname>` or "pass to opus / composer-2.5 / …".
`<Modellname>` is free text. Resolution is **code** (`$ROSTER pass-to`), not
your judgment:

1. Roster first (exact model key / `cli_model` / `cli:model`, else fuzzy substring).
2. **One** hit → use it.
3. **Several** hits → stop, list candidates, ask the human; re-run with exact id.
4. **Zero** → free-string CLI heuristic (`opus`→claude, `composer*`/`grok*`→cursor,
   `gpt*`→codex, `deepseek*`→hermes). Still unknown → ask human for `cli:model`.

## Steps (in order)

1. **Converge** — finish the current unit of work if cheap; leave the tree
   checkpointable (commit or note uncommitted paths in HANDOFF).
2. **Write `HANDOFF.md`** in the working directory (cwd / task dir):

```markdown
# HANDOFF

## Current state
<1 short paragraph>

## Done
- …

## Open (exact next steps)
- …

## Verification
- <commands to run>

## Paths
- …
```

3. **TIM handoff** — follow the `tim-handoff` skill (checkpoint + Next Steps
   merge). If TIM is unavailable, note that in chat and still continue with
   `HANDOFF.md` (disk handoff must not block).
4. **Spawn pinned session:**

```bash
$ROSTER pass-to --model "<Modellname>" --dir "$PWD"
```

5. **Report to the human** — copy the script's lines verbatim:
   - `tmux session: <full-id>`
   - `attach: tmux attach -t <full-id>`
   Also echo resolved `model: … (cli)` so they see what launched.
6. **Stop** — do not keep working in this session. The human attaches to tmux.

Exit codes from `pass-to`: `3` = ambiguous (show list, ask), `4` = unresolved
(ask for a clearer name or `cli:model`), other non-zero = fix HANDOFF/roster
and retry. Never invent a substitute model.

## Not this skill

- Automatic ≥handoff-threshold limit warning → `roster` limit handoff
  (`$ROSTER handoff --role …`), not pass-to.
- External coding workers the parent waits on → `dispatch` Path B (mailbox +
  watcher). Pass-to is **human-attach**, no watcher.
- In-host search/lookup → `dispatch` Path A.
