<!-- o9k-provenance
who: codex:gpt-5
when: 2026-07-25T18:36:00Z
why: Checkpoint current team-up production integration before resuming the same Codex thread in tmux
trigger: kanns du zufällig unsere momentan laufende Session in eine TMUX-Session extrahieren?
host: codex
-->
# HANDOFF

## Current state

The user requested that every remaining `team-up` production-integration step
be completed and tested. Work is mid-flight: the standalone repositories are
already public and synchronized, and the o9k adapter has just been merged into
local `main`, but that merge has not yet been pushed and the live server
configuration has not yet been migrated.

## Done

- Created and pushed public repositories:
  - `https://github.com/Bumblebiber/team-up`
  - `https://github.com/Bumblebiber/team-up-with-hannes`
  - `https://github.com/Bumblebiber/team-up-with-hugo`
- Verified local and remote `main` SHAs match for all three repositories.
- Verified standalone engine: 306/306 tests pass.
- Verified the real Claude harness and o9k adapter/host tests.
- Fixed crash recovery so completed mailbox runs are not restarted.
- Merged `feature/team-up-mvp` into local o9k `main` as commit `97eb013`.
- After the merge, o9k adapter tests pass 4/4 and host tests pass 36/36.

## Open (exact next steps)

1. Do not add or commit unrelated untracked Markdown files in o9k.
2. Push o9k local `main` to `origin/main`. It currently contains:
   - `a35fa87` npm/TIM release
   - `dd18fae` mandatory Path-B dispatch
   - `97eb013` team-up adapter merge
3. Make `/home/bbbee/projects/team-up` executable system-wide, preferably via
   `npm link`, then verify `command -v team-up` and `team-up version`.
4. Back up `~/.o9k/roster.json` before migration.
5. Create `~/.team-up`, copy/import roster and usage state, and migrate the
   roster to the new schema without changing specialist tiers. The legacy file
   has 11 models, 10 roles, no top-level `accounts`, and currently fails the
   new account/reasoning validation.
6. Validate the migrated roster and confirm both abstract profiles resolve:
   - Hannes: `frontier:max`
   - Hugo: `medium:low`
7. Install both packages:
   - `/home/bbbee/projects/team-up-with-hannes`
   - `/home/bbbee/projects/team-up-with-hugo`
8. Approve `testing.hannes@0.1.0` and `research.hugo@0.1.0` for project
   `/home/bbbee/projects/o9k`.
9. Run production end-to-end checks through both direct `team-up` and the thin
   o9k adapter, including `runs resume --dry-run` against `~/.o9k/runs`.
10. Confirm GitHub SHA equality and clean tracked worktrees, then report the
    final operational state and any remaining security advisory.

## Verification

- `npm test` in `/home/bbbee/projects/team-up`
- `node --test plugins/o9k-roster/scripts/*.test.mjs` in o9k
- `node --test plugins/o9k-core/scripts/hosts/*.test.mjs` in o9k
- `team-up validate`
- `team-up pick --profile frontier:max`
- `team-up pick --profile medium:low`
- `TEAM_UP_RUNS=/home/bbbee/.o9k/runs team-up runs resume --dry-run`
- compare `git rev-parse HEAD` with `git rev-parse origin/main`

## Paths

- `/home/bbbee/projects/o9k`
- `/home/bbbee/projects/team-up`
- `/home/bbbee/projects/team-up-with-hannes`
- `/home/bbbee/projects/team-up-with-hugo`
- `/home/bbbee/.o9k/roster.json`
- `/home/bbbee/.team-up/`

## Worktree warning

The o9k worktree contains unrelated untracked files owned by the user or prior
agents: `docs/ESSAY-skill-bloat.md`, `docs/ESSAY-skill-bloat-REVIEW.md`, the
specialist design/spec plan files, and this `HANDOFF.md`. Preserve them and do
not include them in integration commits.

<!-- o9k-provenance
who: codex:gpt-5
when: 2026-07-25T12:17:11Z
why: Manual planning handoff to GPT-5.6 Sol
trigger: rufe /o9k-pass-to GPT 5.6 Sol auf und gib ihm die Aufgabe, dies zu planen
host: codex
-->
