<!-- o9k-provenance
who: codex:gpt-5
when: 2026-07-25T13:08:28Z
why: Provide the executable TDD plan for extracting team-up and building the specialist MVP
trigger: Direkt nach dem Spec schreiben implementation plan schreiben und dann an Cursor (Grok 4.5 high) zum Ausführen geben.
host: codex
-->
# `team-up` Specialist MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract o9k-roster into a standalone `team-up` engine and deliver two separately versioned specialists, Hannes for testing and Hugo for research.

**Architecture:** `team-up` becomes the only owner of roster policy, usage state, mailbox runs, exact-profile chain generation, specialist packages, approval state, context materialization, and worker launch. The o9k branch contains compatibility adapters only. Specialist repositories contain manifests, instructions, skills, and evals but never concrete model names or executable install hooks.

**Tech Stack:** Node.js 24/ES modules with Node `>=18` compatibility, native `node:test`, Bash mailbox watcher, tmux, optional Linux `systemd-run --user` sandbox, JSON configuration.

---

## Execution Coordinates

- Design spec: `/home/bbbee/projects/o9k/docs/superpowers/specs/2026-07-25-team-up-specialists-design.md`
- Task root: `/home/bbbee/projects/tasks/task-team-up-mvp`
- New engine repo: `/home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up`
- Hannes repo: `/home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up-with-hannes`
- Hugo repo: `/home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up-with-hugo`
- Isolated o9k worktree: `/home/bbbee/projects/o9k/.worktrees/team-up-adapter`
- o9k branch: `feature/team-up-mvp`
- o9k baseline: `main` at `f3cb39e`
- Effort reference commit: `045d95f` — port its behavior, do not reset the o9k branch to its older parent
- No GitHub repositories, releases, pushes, or package publication in this plan

Baseline evidence before implementation:

```text
node --test plugins/o9k-roster/scripts/*.test.mjs plugins/o9k-roster/scripts/collectors/*.test.mjs
127 passed, 0 failed
bash plugins/o9k-roster/scripts/wait-mailbox.test.sh
wait-mailbox.test.sh OK
```

## Target File Structure

```text
team-up/
  package.json
  README.md
  LICENSE
  bin/team-up.mjs
  src/
    cli.mjs
    paths.mjs
    json-store.mjs
    roster/
      config.mjs
      chain.mjs
      command.mjs
      profile.mjs
    runs/
      runs.mjs
    specialists/
      manifest.mjs
      store.mjs
      approvals.mjs
      request.mjs
      launcher.mjs
    sandbox/
      materialize.mjs
      systemd.mjs
    usage/
    scores/
  templates/
    worker-prompt.md
    watcher-prompt.md
  scripts/
    wait-mailbox.sh
  test/
    roster/
    runs/
    specialists/
    sandbox/
    integration/

team-up-with-hannes/
  package.json
  specialist.json
  instructions.md
  skills/testing.md
  evals/evals.json

team-up-with-hugo/
  package.json
  specialist.json
  instructions.md
  skills/research.md
  evals/evals.json
```

Each module owns one concern. Files copied from o9k retain their tests before
their imports and paths are changed.

### Task 1: Scaffold the Three Standalone Repositories

**Files:**

- Create: `repos/team-up/package.json`
- Create: `repos/team-up/bin/team-up.mjs`
- Create: `repos/team-up/src/cli.mjs`
- Create: `repos/team-up/test/cli.test.mjs`
- Create: `repos/team-up-with-hannes/package.json`
- Create: `repos/team-up-with-hugo/package.json`

- [ ] **Step 1: Initialize local repositories without remotes**

```bash
cd /home/bbbee/projects/tasks/task-team-up-mvp/repos
mkdir team-up team-up-with-hannes team-up-with-hugo
git -C team-up init -b main
git -C team-up-with-hannes init -b main
git -C team-up-with-hugo init -b main
```

Expected: three independent `.git` directories; `git remote -v` is empty in
each repository.

- [ ] **Step 2: Write the failing CLI test**

```js
// team-up/test/cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.mjs";

test("version prints package version", async () => {
  const lines = [];
  const code = await runCli(["version"], { out: line => lines.push(line) });
  assert.equal(code, 0);
  assert.deepEqual(lines, ["0.1.0"]);
});
```

- [ ] **Step 3: Run the test and verify the missing module failure**

```bash
cd /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up
node --test test/cli.test.mjs
```

Expected: failure resolving `../src/cli.mjs`.

- [ ] **Step 4: Add the zero-dependency package and CLI**

```json
{
  "name": "team-up",
  "version": "0.1.0",
  "description": "Standalone deterministic model roster and specialist runtime",
  "type": "module",
  "bin": { "team-up": "bin/team-up.mjs" },
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=18" },
  "license": "MIT"
}
```

```js
// team-up/src/cli.mjs
export const VERSION = "0.1.0";

export async function runCli(args, io = { out: console.log, err: console.error }) {
  if (args[0] === "version" || args[0] === "--version") {
    io.out(VERSION);
    return 0;
  }
  io.err("usage: team-up <version|validate|pick|dispatch|runs|specialist>");
  return 1;
}
```

```js
#!/usr/bin/env node
// team-up/bin/team-up.mjs
import { runCli } from "../src/cli.mjs";
process.exitCode = await runCli(process.argv.slice(2));
```

- [ ] **Step 5: Run and commit**

```bash
npm test
git add package.json bin src test
git commit -m "chore: scaffold standalone team-up CLI"
```

Expected: one passing test and a clean engine worktree.

### Task 2: Extract Roster, Usage, Scores, and Mailbox Runs

**Files:**

- Create: `team-up/src/roster/{config,chain,command}.mjs`
- Create: `team-up/src/runs/runs.mjs`
- Create: `team-up/src/usage/*.mjs`
- Create: `team-up/src/scores/*.mjs`
- Create: `team-up/templates/{worker-prompt,watcher-prompt}.md`
- Create: `team-up/scripts/wait-mailbox.sh`
- Create: corresponding tests and fixtures under `team-up/test/`

- [ ] **Step 1: Copy characterization tests before implementation**

Copy the 13 Node test suites, fixtures, mailbox shell test, and required
templates from:

```text
/home/bbbee/projects/o9k/.worktrees/team-up-adapter/plugins/o9k-roster/scripts/
```

Preserve assertions first. Change only import paths and fixture paths so tests
target `team-up/src`.

- [ ] **Step 2: Run the copied tests and verify extraction failures**

```bash
cd /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up
npm test
bash test/runs/wait-mailbox.test.sh
```

Expected: module-not-found failures for the not-yet-extracted modules.

- [ ] **Step 3: Extract pure modules and inject paths**

Move behavior rather than importing from o9k. Use these public boundaries:

```js
// src/paths.mjs
import os from "node:os";
import path from "node:path";

export function teamUpHome(env = process.env) {
  return env.TEAM_UP_HOME || path.join(os.homedir(), ".team-up");
}
export const rosterPath = env => env.TEAM_UP_ROSTER || path.join(teamUpHome(env), "roster.json");
export const usagePath = env => env.TEAM_UP_USAGE || path.join(teamUpHome(env), "usage.json");
export const runsPath = env => env.TEAM_UP_RUNS || path.join(teamUpHome(env), "runs");
export const scoresPath = env => env.TEAM_UP_SCORES || path.join(teamUpHome(env), "scores.json");
```

Keep legacy aliases during migration:

```js
export function legacyAwarePath(primary, legacy, env = process.env) {
  return env[primary] || env[legacy] || null;
}
```

Split `roster.mjs` into:

- `config.mjs`: load, validate, state paths;
- `chain.mjs`: chain parsing, exact entry selection, limit gates;
- `command.mjs`: CLI argv and tmux argv;
- `cli.mjs`: command parsing and orchestration.

Move `runs.mjs` into `src/runs/runs.mjs`; replace `rosterPluginRoot()` with a
package-root URL resolver. Move usage and score code without behavior changes,
then update their imports to `paths.mjs`, `config.mjs`, and `runs.mjs`.

- [ ] **Step 4: Preserve atomic state ownership**

All new writes go to `~/.team-up`. During migration, reads may fall back to
`~/.o9k`, but no command writes both locations. Add tests proving:

```js
assert.equal(resolveReadPath({ teamUpExists: false, o9kExists: true }), o9kPath);
assert.equal(resolveWritePath(), teamUpPath);
```

- [ ] **Step 5: Run extraction regressions**

```bash
npm test
bash test/runs/wait-mailbox.test.sh
```

Expected: all copied tests pass and `wait-mailbox.test.sh OK`.

- [ ] **Step 6: Commit**

```bash
git add src templates scripts test
git commit -m "refactor: extract roster runtime and mailbox"
```

### Task 3: Port CLI-Native Reasoning Effort Without Losing Mainline Features

**Files:**

- Modify: `team-up/src/roster/chain.mjs`
- Modify: `team-up/src/roster/command.mjs`
- Modify: `team-up/src/roster/config.mjs`
- Test: `team-up/test/roster/effort.test.mjs`

- [ ] **Step 1: Add failing effort tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseChainEntry, resolveEffort } from "../../src/roster/chain.mjs";
import { buildCommand } from "../../src/roster/command.mjs";

test("effort precedence is cell then role then model", () => {
  const roster = {
    models: { m: { effort: "high" } },
    roles: { r: { effort: "medium" } }
  };
  assert.equal(resolveEffort({ roster, role: "r", model: "m", cellEffort: "max" }), "max");
  assert.equal(resolveEffort({ roster, role: "r", model: "m" }), "medium");
});

test("unset effort removes flag and value", () => {
  const roster = { clis: { codex: { cmd: ["codex", "-c", "model_reasoning_effort={effort}", "{prompt}"] } } };
  assert.deepEqual(buildCommand({ roster, cli: "codex", model: "m", prompt: "p" }), ["codex", "p"]);
});

test("object chain cell carries effort", () => {
  assert.deepEqual(parseChainEntry({ cli: "cursor", model: "m", effort: "high" }),
    { cli: "cursor", model: "m", effort: "high" });
});
```

- [ ] **Step 2: Verify failures**

```bash
node --test test/roster/effort.test.mjs
```

Expected: missing `resolveEffort` or incorrect command argv.

- [ ] **Step 3: Port only the effort diff from `045d95f`**

Use:

```bash
git -C /home/bbbee/projects/o9k show 045d95f -- \
  plugins/o9k-roster/scripts/roster.mjs \
  plugins/o9k-roster/scripts/roster.test.mjs
```

Implement cell → role → model precedence, `{effort}` substitution, flag-pair
removal when unset, output reporting, and non-string validation. Retain
mainline display-name/pass-to behavior from `f3cb39e`.

- [ ] **Step 4: Run and commit**

```bash
npm test
git add src test
git commit -m "feat: support CLI-native reasoning effort"
```

### Task 4: Resolve Abstract Profiles into Exact-Tier Fallback Chains

**Files:**

- Create: `team-up/src/roster/profile.mjs`
- Test: `team-up/test/roster/profile.test.mjs`
- Modify: `team-up/src/roster/config.mjs`
- Modify: `team-up/src/cli.mjs`

- [ ] **Step 1: Add failing resolver tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProfile } from "../../src/roster/profile.mjs";

const roster = {
  accounts: {
    cursor: { kind: "subscription", enabled: true },
    api: { kind: "credit", enabled: true, remaining: 12 }
  },
  clis: {
    cursor: { cmd: ["cursor-agent", "--model", "{model}", "{prompt}"] },
    codex: { cmd: ["codex", "--model", "{model}", "-c", "model_reasoning_effort={effort}", "{prompt}"] }
  },
  models: {
    frontier: { tier: "frontier", cli: ["codex"], account: "api", reasoning: { max: "xhigh" }, priority: 1 },
    mediumA: { tier: "medium", cli: ["cursor"], account: "cursor", reasoning: { low: null }, priority: 1 },
    mediumB: { tier: "medium", cli: ["codex"], account: "api", reasoning: { low: "low" }, priority: 2 },
    low: { tier: "low", cli: ["cursor"], account: "cursor", reasoning: { low: null }, priority: 0 }
  }
};

test("returns same-tier cells only", () => {
  const result = resolveProfile({ roster, profile: { tier: "medium", reasoning: "low" }, usage: {} });
  assert.deepEqual(result.chain.map(x => x.model), ["mediumA", "mediumB"]);
  assert.ok(!result.chain.some(x => x.model === "frontier" || x.model === "low"));
});

test("does not upgrade when exact tier is unavailable", () => {
  const result = resolveProfile({ roster, profile: { tier: "high", reasoning: "max" }, usage: {} });
  assert.equal(result.code, "PROFILE_UNAVAILABLE");
  assert.deepEqual(result.chain, []);
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test test/roster/profile.test.mjs
```

Expected: module-not-found for `profile.mjs`.

- [ ] **Step 3: Implement deterministic exact matching**

```js
export function resolveProfile({ roster, profile, usage, specialistId, callType }) {
  const effective = roster.specialists?.[specialistId]?.calls?.[callType]?.model_profile
    || roster.specialists?.[specialistId]?.model_profile
    || profile;
  const chain = [];
  const skipped = [];

  for (const [model, spec] of Object.entries(roster.models || {})) {
    if (spec.tier !== effective.tier) {
      skipped.push({ model, reason: `tier ${spec.tier} != ${effective.tier}` });
      continue;
    }
    const account = roster.accounts?.[spec.account];
    if (!account?.enabled || (account.kind === "credit" && !(account.remaining > 0))) {
      skipped.push({ model, reason: "account unavailable" });
      continue;
    }
    for (const cli of spec.cli || []) {
      if (!(effective.reasoning in (spec.reasoning || {}))) continue;
      chain.push({ cli, model, effort: spec.reasoning[effective.reasoning], priority: spec.priority ?? 100 });
    }
  }
  chain.sort((a, b) => a.priority - b.priority || `${a.cli}:${a.model}`.localeCompare(`${b.cli}:${b.model}`));
  return chain.length
    ? { code: "OK", profile: effective, chain, skipped }
    : { code: "PROFILE_UNAVAILABLE", profile: effective, chain: [], skipped };
}
```

Integrate existing usage-window/marked-limit gates before a cell enters the
chain. Import old `tier: "mid"` as new `tier: "medium"`; reject ambiguous
unknown tiers. Add `team-up pick --profile <tier>:<reasoning>`.

- [ ] **Step 4: Test no-upgrade/no-downgrade and commit**

```bash
npm test
git add src test
git commit -m "feat: resolve exact specialist model profiles"
```

### Task 5: Validate and Install Specialist Packages

**Files:**

- Create: `team-up/src/specialists/manifest.mjs`
- Create: `team-up/src/specialists/store.mjs`
- Create: `team-up/src/specialists/approvals.mjs`
- Test: `team-up/test/specialists/{manifest,store,approvals}.test.mjs`
- Modify: `team-up/src/cli.mjs`

- [ ] **Step 1: Write rejection and approval tests**

```js
test("rejects concrete model names and install hooks", () => {
  assert.match(validateManifest({ ...valid, model: "grok-4.5-high" }).errors.join("\n"), /model/);
  assert.match(validateManifest({ ...valid, install: "curl x | sh" }).errors.join("\n"), /install/);
});

test("approval is bound to project, version, checksum, and permissions", () => {
  const key = approvalKey({
    project: "/work/app",
    id: "testing.hannes",
    version: "0.1.0",
    checksum: "sha256:abc",
    permissions: { filesystem: "project", network: false }
  });
  assert.notEqual(key, approvalKey({
    project: "/work/app",
    id: "testing.hannes",
    version: "0.1.0",
    checksum: "sha256:def",
    permissions: { filesystem: "project", network: false }
  }));
});
```

- [ ] **Step 2: Verify failures**

```bash
node --test test/specialists/manifest.test.mjs test/specialists/approvals.test.mjs
```

- [ ] **Step 3: Implement the versioned JSON contract**

Required manifest keys:

```js
export const REQUIRED = [
  "schema_version", "id", "display_name", "version", "remit", "anti_remit",
  "call_types", "accepted_inputs", "output_contract", "capabilities",
  "permissions", "budget", "model_profile", "eval_suite"
];
```

Reject keys named `model`, `provider`, `install`, `postinstall`, `preinstall`,
or `scripts` anywhere in the parsed manifest. Validate tier against
`frontier|high|medium|low` and reasoning against `max|high|medium|low`.

Install by copying declared package files into:

```text
~/.team-up/specialists/<id>/<version>/<checksum>/
```

Never execute package content. Store approvals atomically in:

```text
~/.team-up/approvals.json
```

Add CLI commands:

```text
team-up specialist inspect <path>
team-up specialist install <path>
team-up specialist approve <id>@<version> --project <absolute-path>
team-up specialist list
```

- [ ] **Step 4: Test atomic install and changed-checksum reapproval**

```bash
npm test
git add src test
git commit -m "feat: add specialist package store and approvals"
```

### Task 6: Add Typed Requests and Results to Mailbox Runs

**Files:**

- Create: `team-up/src/specialists/request.mjs`
- Modify: `team-up/src/runs/runs.mjs`
- Test: `team-up/test/specialists/request.test.mjs`
- Test: `team-up/test/runs/typed-result.test.mjs`

- [ ] **Step 1: Write contract tests**

```js
test("review is read-only by default", () => {
  const request = normalizeRequest({
    specialist_id: "testing.hannes",
    call_type: "review",
    objective: "Review test plan",
    inputs: []
  });
  assert.equal(request.permissions.writes, false);
  assert.equal(request.depth, 0);
});

test("result rejects unknown status", () => {
  assert.throws(() => validateResult({ status: "done-ish" }), /status/);
});
```

- [ ] **Step 2: Verify failures**

```bash
node --test test/specialists/request.test.mjs test/runs/typed-result.test.mjs
```

- [ ] **Step 3: Implement `team-up.request/v1` and `team-up.result/v1`**

Request fields:

```js
{
  schema: "team-up.request/v1",
  run_id,
  specialist_id,
  specialist_version,
  call_type,
  objective,
  inputs,
  expected_result,
  permissions,
  budget,
  parent_run: null,
  depth: 0
}
```

Result fields:

```js
{
  schema: "team-up.result/v1",
  status: "success" | "partial" | "blocked" | "failed",
  summary,
  deliverables,
  evidence,
  risks,
  questions,
  runtime: { cli, model, effort },
  usage: { tokens, duration_ms },
  children: []
}
```

Store `REQUEST.json` and `RESULT.json` beside the existing text mailbox for
backward compatibility. Classification returns `failed` for malformed terminal
JSON and includes the validation error.

- [ ] **Step 4: Run and commit**

```bash
npm test
git add src test
git commit -m "feat: add typed specialist mailbox contracts"
```

### Task 7: Materialize Context and Launch Through a Fail-Closed Sandbox Adapter

**Files:**

- Create: `team-up/src/sandbox/materialize.mjs`
- Create: `team-up/src/sandbox/systemd.mjs`
- Create: `team-up/src/specialists/launcher.mjs`
- Test: `team-up/test/sandbox/{materialize,systemd}.test.mjs`
- Test: `team-up/test/specialists/launcher.test.mjs`
- Modify: `team-up/src/cli.mjs`

- [ ] **Step 1: Add isolation tests**

```js
test("materializer copies only selected package files", async () => {
  const root = await materialize({ packageDir: hannes, request, destination: out });
  assert.equal(await exists(path.join(root, "instructions.md")), true);
  assert.equal(await exists(path.join(root, "../team-up-with-hugo")), false);
});

test("launcher refuses unsupported permission enforcement", async () => {
  await assert.rejects(
    launch({ sandbox: { available: false }, permissions: { network: false } }),
    /SANDBOX_UNAVAILABLE/
  );
});
```

- [ ] **Step 2: Verify failures**

```bash
node --test test/sandbox/*.test.mjs test/specialists/launcher.test.mjs
```

- [ ] **Step 3: Implement context materialization**

Create a fresh run directory containing only:

- normalized request;
- selected manifest;
- selected instructions and declared skills;
- resolved input artifacts;
- mailbox files;
- generated worker prompt.

Reject symlinks escaping the package or project roots. Resolve every copied path
with `realpath` and verify it remains under an approved root.

- [ ] **Step 4: Implement Linux systemd sandbox argv**

```js
export function systemdSandboxArgv({ cwd, network, writablePaths, command }) {
  const properties = [
    "ProtectSystem=strict",
    "PrivateTmp=yes",
    "NoNewPrivileges=yes",
    `WorkingDirectory=${cwd}`,
    `PrivateNetwork=${network ? "no" : "yes"}`
  ];
  for (const p of writablePaths) properties.push(`ReadWritePaths=${p}`);
  return [
    "systemd-run", "--user", "--wait", "--collect", "--pipe",
    ...properties.flatMap(p => ["-p", p]),
    "--", ...command
  ];
}
```

Probe `systemd-run --user` before launch. If requested restrictions cannot be
enforced, return `SANDBOX_UNAVAILABLE`; never silently fall back to an
unrestricted `--yolo` process. A local roster may explicitly define a different
tested sandbox adapter later.

- [ ] **Step 5: Implement launch sequence**

`team-up specialist run` must:

1. resolve installed package and approval;
2. normalize the request;
3. resolve the exact model profile;
4. create the mailbox run;
5. materialize context;
6. build CLI argv with mapped effort;
7. wrap it in the sandbox adapter;
8. start tmux and link the run;
9. print run ID, concrete runtime choice, and watcher command.

- [ ] **Step 6: Run host probe, tests, and commit**

```bash
systemd-run --user --wait --pipe -p ProtectSystem=strict -p PrivateTmp=yes true
npm test
git add src test
git commit -m "feat: launch isolated specialist workers"
```

Expected: systemd probe exits zero on this host; all unit tests pass.

### Task 8: Build Hannes and Hugo as Separate Repositories

**Files:**

- Create in each repo: `package.json`, `specialist.json`, `instructions.md`,
  one `skills/*.md`, and `evals/evals.json`
- Create: `team-up/test/integration/starter-specialists.test.mjs`

- [ ] **Step 1: Write integration tests before packages**

Test both package paths with `validateManifest`. Assert:

```js
assert.equal(hannes.id, "testing.hannes");
assert.deepEqual(hannes.model_profile, { tier: "frontier", reasoning: "max" });
assert.equal(hugo.id, "research.hugo");
assert.deepEqual(hugo.model_profile, { tier: "medium", reasoning: "low" });
assert.equal(JSON.stringify(hannes).includes("grok"), false);
assert.equal(JSON.stringify(hugo).includes("claude"), false);
```

- [ ] **Step 2: Verify package-not-found failures**

```bash
cd /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up
node --test test/integration/starter-specialists.test.mjs
```

- [ ] **Step 3: Create Hannes**

Hannes remit: test strategy, regression tests, failure reproduction, and
verification review. Anti-remit: product prioritization, unrelated feature
implementation, deployment, and weakening assertions merely to make tests pass.

Use:

```json
{
  "schema_version": 1,
  "id": "testing.hannes",
  "display_name": "Hannes",
  "version": "0.1.0",
  "remit": ["test strategy", "regression testing", "verification review"],
  "anti_remit": ["product roadmap", "deployment", "unrelated implementation"],
  "call_types": ["consult", "delegate", "review"],
  "accepted_inputs": ["task_description", "repository_reference", "artifact_reference"],
  "output_contract": "team-up.result/v1",
  "capabilities": { "skills": ["testing"], "tools": ["filesystem.read", "command.test"], "mcps": [], "frameworks": [] },
  "permissions": { "filesystem": "project", "writes": "delegated_only", "network": false, "commands": ["project-test"] },
  "budget": { "timeout_seconds": 1800, "max_tokens": 80000 },
  "model_profile": { "tier": "frontier", "reasoning": "max" },
  "eval_suite": "evals/evals.json"
}
```

- [ ] **Step 4: Create Hugo**

Hugo remit: source discovery, evidence synthesis, provenance, and uncertainty
reporting. Anti-remit: unsourced factual invention, code mutation, deployment,
and treating search snippets as primary evidence.

Use the same schema with:

```json
{
  "id": "research.hugo",
  "display_name": "Hugo",
  "capabilities": { "skills": ["research"], "tools": ["filesystem.read", "network.http"], "mcps": [], "frameworks": [] },
  "permissions": { "filesystem": "project_readonly", "writes": false, "network": true, "commands": [] },
  "model_profile": { "tier": "medium", "reasoning": "low" }
}
```

Merge those fields into a complete manifest containing every required key.

- [ ] **Step 5: Add evals**

Each eval file contains at least:

- two positive remit cases;
- two anti-remit refusal cases;
- one case for each call type;
- one malformed-input case;
- expected result schema and permission assertions.

- [ ] **Step 6: Test and commit each repo**

```bash
cd /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up
npm test
git -C ../team-up-with-hannes add .
git -C ../team-up-with-hannes commit -m "feat: add Hannes testing specialist"
git -C ../team-up-with-hugo add .
git -C ../team-up-with-hugo commit -m "feat: add Hugo research specialist"
git add test/integration
git commit -m "test: validate starter specialist packages"
```

### Task 9: Replace o9k Runtime Ownership with Compatibility Adapters

**Files:**

- Modify: `/home/bbbee/projects/o9k/.worktrees/team-up-adapter/plugins/o9k-roster/.claude-plugin/plugin.json`
- Modify: old public entry points under `plugins/o9k-roster/scripts/`
- Modify: `plugins/o9k-roster/skills/{roster,roster-refresh}/SKILL.md`
- Modify: `plugins/o9k-roster/skills/pass-to/SKILL.md`
- Modify: `plugins/o9k-dispatch/skills/dispatch/SKILL.md`
- Modify: `plugins/o9k-core/compat/registry.json`
- Modify: `.claude-plugin/marketplace.json`
- Test: `plugins/o9k-roster/scripts/team-up-adapter.test.mjs`

- [ ] **Step 1: Write adapter tests**

Inject a fake `TEAM_UP_BIN` and assert:

```js
assert.deepEqual(buildTeamUpArgv("roster", ["pick", "--role", "reviewer"]),
  [fakeBin, "pick", "--role", "reviewer"]);
assert.deepEqual(buildTeamUpArgv("runs", ["wait", "run-1"]),
  [fakeBin, "runs", "wait", "run-1"]);
```

Also assert a missing binary prints one actionable installation/configuration
error and exits nonzero.

- [ ] **Step 2: Verify test failures**

```bash
cd /home/bbbee/projects/o9k/.worktrees/team-up-adapter
node --test plugins/o9k-roster/scripts/team-up-adapter.test.mjs
```

- [ ] **Step 3: Implement thin adapters**

Old script paths remain callable for hooks and host wiring, but delegate to:

```text
TEAM_UP_BIN, when set
team-up on PATH, otherwise
```

Map old commands to new commands without reading or writing roster state inside
o9k. Keep Path-B semantics unchanged:

```text
runs create → dispatch --run-id → runs wait
```

Update skills and descriptions to identify `team-up` as owner. Keep migration
instructions from `~/.o9k` to `~/.team-up`. Do not remove the plugin entry in
this MVP; mark it as the compatibility adapter.

- [ ] **Step 4: Run complete o9k regressions**

```bash
node --test plugins/o9k-roster/scripts/*.test.mjs plugins/o9k-roster/scripts/collectors/*.test.mjs
bash plugins/o9k-roster/scripts/wait-mailbox.test.sh
node --test plugins/o9k-core/scripts/hosts/*.test.mjs
```

Expected: all retained tests pass. Adapter tests prove no runtime state mutation
remains in the new wrapper entry points.

- [ ] **Step 5: Commit o9k adapter**

```bash
git add plugins/o9k-roster plugins/o9k-dispatch plugins/o9k-core .claude-plugin/marketplace.json
git commit -m "refactor(roster): delegate runtime ownership to team-up"
```

### Task 10: End-to-End Verification and Handoff

**Files:**

- Create: `team-up/test/integration/mvp-flow.test.mjs`
- Create: `team-up/README.md`
- Create: `team-up/docs/configuration.md`
- Create: `team-up/docs/specialists.md`
- Create: `/home/bbbee/projects/tasks/task-team-up-mvp/RESULT.md`

- [ ] **Step 1: Write the end-to-end test**

Using temporary `TEAM_UP_HOME`, a fake CLI command, and fixture usage:

1. import legacy roster config;
2. install Hannes and Hugo;
3. approve Hannes for a temporary project;
4. resolve Hannes to exact `frontier + max`;
5. prove no `high`, `medium`, or `low` cell appears;
6. create a `review` request;
7. materialize only Hannes;
8. write a typed result and classify the run as successful;
9. modify Hannes checksum and prove launch requires reapproval;
10. request an unavailable tier and prove `PROFILE_UNAVAILABLE`.

- [ ] **Step 2: Run all verification commands**

```bash
cd /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up
npm test
bash test/runs/wait-mailbox.test.sh
node bin/team-up.mjs version

cd /home/bbbee/projects/o9k/.worktrees/team-up-adapter
node --test plugins/o9k-roster/scripts/*.test.mjs plugins/o9k-roster/scripts/collectors/*.test.mjs
bash plugins/o9k-roster/scripts/wait-mailbox.test.sh
node --test plugins/o9k-core/scripts/hosts/*.test.mjs

git -C /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up status --short
git -C /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up-with-hannes status --short
git -C /home/bbbee/projects/tasks/task-team-up-mvp/repos/team-up-with-hugo status --short
git -C /home/bbbee/projects/o9k/.worktrees/team-up-adapter status --short
```

Expected:

- all test commands exit zero;
- `team-up` prints `0.1.0`;
- all four worktrees are clean;
- each repository has implementation commits;
- no repository has a remote or pushed branch.

- [ ] **Step 3: Review requirements line by line**

Record each of the 14 design acceptance criteria as `PASS` or `FAIL` with the
supporting command/test. Do not report overall completion when any criterion is
`FAIL`.

- [ ] **Step 4: Write mailbox result**

`RESULT.md` must contain:

- status and acceptance-criterion table;
- repository paths, branches, and commit hashes;
- exact test totals and commands;
- any residual security limitation;
- migration instructions;
- recommended independent review scope;
- explicit confirmation that nothing was pushed or published.

Then follow the mailbox protocol: write terminal result artifacts and set
`STATUS=done`; use `STATUS=failed` with evidence if implementation cannot meet
the acceptance criteria.
