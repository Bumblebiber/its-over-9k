# Fixauftrag — remaining findings from the 2026-07-18 full-project review

Status: **all 13 items fixed** on `claude/projekt-gesamtreview-bhh990`
(2026-07-18, one commit per item — see the individual **fixed** markers
below). Kept as the review record.

## Deliberately deferred (not in scope of this Fixauftrag)

- **Native Windows support for the multi-agent stack** (roster dispatch,
  runs/resume, PTY collector). The Unix dependencies (tmux, expect, bash
  wrappers) would need Windows equivalents (e.g. Windows Terminal tabs or
  ConPTY via node-pty, PowerShell wrappers) — a design of its own, not a
  fix. Until then: WSL, as documented in the README platform matrix. The
  cheap Windows correctness fixes (`.cmd` shim spawns, `onPath`
  extensions) are done.

The quick wins from the same review were fixed first on
`claude/projekt-gesamtreview-bhh990`:

- hermetic o9k-core tests (fake-bin `pathEnv` instead of relying on installed
  `codex`/`cursor` binaries; 73/73 green on a bare machine)
- CI workflow (`.github/workflows/test.yml`, ubuntu + macos × node 20/22)
- `wait-mailbox.sh` BSD/macOS fallback (`find -printf` is GNU-only)
- `acquireResumeLock` TOCTOU → `wx`-flag create (runs.mjs)
- Stop-hook debounce stamped only after a *successful* collect + collector
  recursion guard (usage-stop-collect.mjs)
- Windows `.cmd`-shim spawns: `shell: win32` for `hmem`/`tim`/`npm`/`claude`
  (backend.mjs, update-check.mjs, usage-collect.mjs)
- repo hygiene: `.tim-project` untracked + ignored; installer `head()` renamed
  to `banner()` (shadowed the coreutils binary)

Everything below is ordered by priority. Each item: problem → where → what to do.

---

## P1 — visible correctness / platform gaps

### 1. macOS: agent process counting silently reports 0 — **fixed**
`plugins/o9k-roster/scripts/usage-procs.mjs` reads `/proc/<pid>/cmdline` and
`/proc/<pid>/environ` — Linux-only. On macOS `listProcPids()` returns `[]`, so
the adaptive watcher always sees "idle" and schedules the slowest cadence.
**Fix:** add a `ps -axo pid=,command=` fallback for `darwin` (cmdline matching
already works on the joined command string; the env-marker check degrades to
cmdline-only there). Unit-testable via the existing `listPids`/`readCmdline`
injection points.

### 2. Support matrix + platform requirements in README — **fixed**
Nothing in the README states OS requirements. Reality after the quick-win
fixes: **Linux** first-class; **macOS** core pillars fine, roster needs `tmux`
(brew) and has no watcher/resume services (see item 3); **Windows** core/memory
hooks work, the whole roster/runs/collector stack (tmux, expect, bash, systemd)
does not — point Windows users at WSL.
**Fix:** add a short "Platforms" section to README.md + a loud early check in
`/o9k-init` (SKILL.md step: report unsupported host OS instead of silently
wiring half a stack).

### 3. macOS: no launchd equivalents for the two systemd units — **fixed**
`plugins/o9k-roster/systemd/{o9k-usage-watcher,o9k-resume}.service` have no
macOS counterpart, so watcher + boot-resume don't exist there.
**Fix:** ship `launchd/` plists (`o9k.usage-watcher.plist` with
`KeepAlive`, `o9k.resume.plist` with `RunAtLoad`) + install notes in
MULTI-AGENT.md, mirroring the systemd comments.

## P2 — operational quality

### 4. Personal infra baked into cron scripts — **fixed**
`roster-refresh-cron.sh` calls `~/.hermes/bin/send-cron-telegram`
(@bbbeeCronBot); both cron scripts prefer `~/.hermes/cron-outputs`. That is the
author's private rig, not the product.
**Fix:** replace the telegram call with an optional generic hook
(`O9K_NOTIFY_CMD` env: gets the report path as `$1`), and make the hermes
output dir an env override (`O9K_REPORT_DIR`) instead of an auto-preference.

### 5. Versioning scheme is ambiguous — **fixed**
Repo-level CHANGELOG says 0.11.0; `o9k-roster/plugin.json` says 0.2.0,
`o9k-core` 0.9.1; commit messages mix them ("o9k-roster 0.11.0").
**Fix:** decide: (a) lockstep — all plugin.json versions = marketplace
version, or (b) independent — then CHANGELOG headings must name
plugin@version. Document the choice in CONTRIBUTING or CHANGELOG header;
bump the drifted manifests once.

### 6. No uninstall / doctor path — **fixed**
`o9k-init` spreads symlinks (`~/.agents/skills/o9k`, host skillDirs), Cursor
rules, host hook wrappers with baked absolute marketplace paths. Moving or
deleting the repo leaves dangling links nobody diagnoses.
**Fix:** `o9k-doctor.mjs` (read-only: list every artifact o9k wrote, flag
dangling/stale) + `o9k-uninstall.mjs` (reverse of syncSkills/wireHosts).
Most of the inventory logic already exists in `skillDrift()`/`verifyHost()`.

### 7. Silent degradation is undiagnosable — **fixed**
Hooks correctly swallow all errors (exit 0), but there is no way to *see*
the swallowed failures — the Windows `.cmd` bug went unnoticed exactly
because of this.
**Fix:** honor `O9K_DEBUG=1` in every hook entry point: log caught errors to
stderr (Claude Code shows hook stderr in verbose mode) or append to
`~/.o9k/logs/hook-errors.log`. One shared `debugLog()` helper is enough.

### 8. Stop hook runs a synchronous 45 s collect — **fixed**
`usage-stop-collect.mjs` runs `claude -p "/usage"` in-line (Stop-hook timeout
120 s). Worst case the user waits ~45 s at end-of-turn every 15 min.
**Fix:** spawn the collect detached (`spawn(..., {detached, stdio:"ignore"})
.unref()` — same pattern as pre-compact.mjs) and let the PTY lock serialize;
stamp the debounce from the child on success.

## P3 — smaller hardening

### 9. `roster.json` has no schema validation — **fixed**
Structurally wrong config (chain entry typos, missing `clis`) surfaces as
late `pick` errors or silent skips.
**Fix:** a `validateRoster(roster)` called by `requireRoster()` printing all
problems at once; cover with tests.

### 10. `o9k-stats.mjs` guesses Claude Code’s transcript path encoding — **fixed**
`projectDir.replace(/[\\/.:]/g, "-")` re-implements an undocumented Claude
Code detail; silently prints "no transcripts" when the encoding drifts.
**Fix:** on miss, scan `~/.claude/projects/*` and match against the `cwd`
field inside the newest `.jsonl` lines instead of failing.

### 11. `onPath(bin, pathEnv)` ignores Windows extensions — **fixed**
`detect.mjs` checks `existsSync(join(dir, bin))` — on Windows the file is
`bin.cmd`/`bin.exe`.
**Fix:** probe `bin`, `bin.exe`, `bin.cmd`, `bin.bat` when
`process.platform === "win32"`.

### 12. OpenCode adapter target list is hand-synced — **fixed**
`opencode-o9k.ts` keeps `SESSION_START_TARGETS` "in sync by hand" with
`common.mjs` `HOOK_WRAPPERS` — classic drift risk.
**Fix:** have `wire-opencode.mjs` inject the target list at wire time (it
already rewrites `__O9K_MARKETPLACE_ROOT__`).

### 13. Benchmark claims vs sample size — **fixed**
`benchmarks/results/*` are single runs from one day; README's "~50–65 %"
figure is inherited from upstream caveman.
**Fix:** note n=1 in benchmarks/README.md, and let `run-bench.sh` take a
`--repeat N` to emit mean/spread before quoting numbers.
