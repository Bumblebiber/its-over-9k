<!-- o9k-provenance
who: codex:gpt-5
when: 2026-07-25T13:03:04Z
why: Record the user-approved standalone team-up and specialist-repository design
trigger: Direkt nach dem Spec schreiben implementation plan schreiben und dann an Cursor (Grok 4.5 high) zum Ausführen geben.
host: codex
-->
# `team-up` Specialist Ecosystem Design

**Status:** Approved for implementation  
**Date:** 2026-07-25  
**Scope:** Standalone roster engine, specialist package contract, two first-party specialists, and an o9k compatibility adapter

## Purpose

Extract all roster-related functionality from o9k into a standalone project named
`team-up`. The engine must work with o9k and with other agent frameworks. It
selects a concrete CLI and model from the user's subscriptions, credits, limits,
and model inventory, then runs a deliberately selected specialist in an isolated
worker.

The first two specialists are:

- `team-up-with-hannes`: testing specialist
- `team-up-with-hugo`: research specialist

One repository contains exactly one specialist. Human names are user experience;
the machine-readable manifest is authoritative.

## Repository Boundaries

### `team-up`

Owns:

- CLI and configuration validation
- model and CLI inventory
- subscriptions, credit pools, prices, and usage limits
- abstract model-profile resolution
- deterministic fallback-chain generation
- CLI-specific reasoning/effort mapping
- specialist discovery, inspection, approval, pinning, and launch
- isolated worker materialization
- typed mailbox runs
- permissions, budgets, provenance, and conformance evals

It contains no specialist prompts or specialist-specific skills.

### `team-up-with-<name>`

Each repository owns one specialist's:

- manifest and human-readable identity
- remit and anti-remit
- instructions and skills
- declared tool, MCP, and framework dependencies
- permissions and budgets
- input and output contracts
- visible evals and compatibility metadata
- signed release artifacts

Packages contain no executable installation hooks.

### o9k

o9k keeps a thin adapter that translates its dispatch, review, and handoff calls
into the public `team-up` CLI/API. The existing o9k-roster user configuration is
importable. Roster policy and runtime logic must not be duplicated in o9k.

## Mental Model

A specialist is an employee:

- the registry entry is the employee's business card;
- the specialist package is the employee's handbook and approved toolbox;
- the model is the replaceable worker currently filling the role;
- the sandbox is the employee's temporary office;
- the parent agent remains responsible for final integration and user
  communication.

Only the selected specialist's package and approved dependencies enter the
worker context. Other specialists, skills, and MCP schemas remain dormant.

## Specialist Manifest

The manifest uses a versioned schema and contains no concrete model identifiers:

```yaml
schema_version: 1
id: testing.hannes
display_name: Hannes
version: 0.1.0
remit:
  - test strategy
  - regression-test design
  - verification review
anti_remit:
  - product roadmap decisions
  - unrequested production deployment
call_types:
  - consult
  - delegate
  - review
accepted_inputs:
  - task_description
  - repository_reference
  - artifact_reference
output_contract: team-up.result/v1
capabilities:
  skills:
    - testing
  tools:
    - filesystem.read
    - command.test
  mcps: []
  frameworks: []
permissions:
  filesystem: project
  writes: delegated_only
  network: false
  commands:
    - project-test
budget:
  timeout_seconds: 1800
  max_tokens: 80000
model_profile:
  tier: frontier
  reasoning: max
eval_suite: evals/hannes.json
```

Required identity and integrity fields added at packaging time include source,
release version, checksum, signature when applicable, and minimum/maximum
supported `team-up` versions.

Validation rejects:

- a concrete model or provider name in the specialist manifest;
- executable install or update hooks;
- undeclared tools, MCPs, frameworks, permissions, or call types;
- an invalid output contract or unsupported schema version.

## Model Profile and Fallback Resolution

A specialist recommends an abstract profile such as:

```yaml
model_profile:
  tier: frontier
  reasoning: max
```

The local roster may explicitly override this recommendation for a specialist
or call type. The effective profile is:

1. a local roster override, when configured;
2. otherwise the specialist manifest recommendation.

Resolution then:

1. reads the effective tier and reasoning requirement;
2. reads the user's model/CLI inventory, subscriptions, credit pools, prices,
   usage windows, and explicit priority policy;
3. retains only enabled models whose tier exactly equals the effective tier;
4. retains only CLI/model pairs that support a configured mapping for the
   requested reasoning level;
5. removes pairs blocked by subscription, credit, usage, or availability gates;
6. sorts the remaining pairs deterministically using local roster policy;
7. emits concrete `{ cli, model, effort }` fallback-chain cells.

Neither stronger nor weaker model tiers are substituted automatically. Changing
the tier requires an explicit roster configuration change. A missing exact-tier
candidate fails with `PROFILE_UNAVAILABLE` and explains which roster facts
blocked each candidate.

The specialist package never sees or pins model names. CLI-native effort strings
remain roster data because different CLIs and models use different vocabularies.

## Selection and Launch

The MVP has no semantic specialist router. A human or parent agent explicitly
provides:

```text
specialist_id + call_type + task
```

The parent agent may choose from the compact specialist index, but must still
name the chosen ID. A human selection overrides an agent selection while all
permission and integrity rules remain enforced.

Before launch, `team-up` verifies:

- installed and project-approved specialist version;
- checksum and signature policy;
- supported call type;
- valid inputs and output contract;
- permissions and remaining budget;
- an available exact model profile.

No missing or failed specialist is silently replaced with another specialist.
Model fallback occurs only inside the generated exact-profile chain.

## Call Types and Mailbox Contract

All calls use one mailbox transport:

- `consult`: analyse and advise; no writes;
- `delegate`: execute a bounded task within approved write permissions;
- `review`: inspect an existing result; read-only by default.

Every request records:

- run ID, specialist ID, package version, and call type;
- objective, inputs, expected result, and artifact references;
- permission snapshot and time/token budget;
- parent run and call depth.

Every result records:

- `success`, `partial`, `blocked`, or `failed`;
- summary, deliverables, evidence, risks, and questions;
- actual model/CLI/effort selected by the local roster;
- resource usage and child-call lineage.

The parent integrates results. Timeouts, crashes, invalid results, budget
exhaustion, and unavailable profiles return structured failures.

## Approval and Package Lifecycle

Approval is project-scoped by default. A human may optionally approve an exact
package version globally.

Lifecycle:

1. discover a compact registry card;
2. inspect the complete manifest and permission request;
3. approve an exact version, checksum, and permission set;
4. install the dormant package;
5. pin the project to a version;
6. launch by explicit specialist ID;
7. stage and inspect updates;
8. roll back to a retained approved version;
9. uninstall after active-run handling.

Any checksum change or permission expansion requires renewed human approval.
The MVP implements local/first-party install, inspect, project approval, pin,
and launch. Remote distribution, update, rollback, and uninstall automation
arrive in the next stage.

## Trust and Supply Chain

Trust tiers:

- first-party release;
- verified external release;
- local development package.

All installed packages record source, version, checksum, signature status,
approved permissions, eval version, and installation time. Versions are pinned;
`latest` is never resolved silently. Local packages remain visibly unverified.

External repositories are out of scope for the MVP. Later external releases
require signatures, checksums, permission diffs, compatibility checks, and
explicit approval.

## Specialist-to-Specialist Calls

The MVP supports only parent-to-specialist calls. The request/result schema
already includes parent run and depth fields.

A later stage may allow a specialist to request `consult`, `delegate`, or
`review` from another specialist through the `team-up` broker. The broker, not
the specialist, launches the child. It enforces:

- an allowlisted call policy;
- default maximum child depth of one;
- ancestor and cycle rejection;
- child budgets deducted from the parent budget;
- child timeout earlier than the parent timeout;
- permission intersection;
- full call-tree provenance;
- explicit propagation of child failures.

## Evals and Governance

Every specialist repository uses issues and pull requests for changes and runs:

- remit success cases;
- anti-remit refusal cases;
- all supported call-type contracts;
- context-isolation checks;
- permission and budget checks;
- compatibility tests against supported `team-up` versions;
- cross-specialist collision tests.

Central hidden holdouts reduce overfitting to public evals. Automated improvement
loops may mutate prompts, skills, or configuration only inside disposable
sandboxes. They produce a pull request and promotion report; they never publish
or install changes without human approval.

## Delivery Stages

### Stage 0: Extraction

- move existing o9k-roster runtime into standalone `team-up`;
- preserve model, CLI, usage, limits, mailbox, score, and effort behaviour;
- add an o9k compatibility adapter and configuration importer.

### Stage 1: Specialist MVP

- add abstract exact-tier model profiles and deterministic chain generation;
- add manifest validation and local package store;
- add inspect, approve, pin, and explicit launch;
- materialize isolated workers;
- support all three mailbox call types;
- ship `team-up-with-hannes` and `team-up-with-hugo`.

### Stage 2: Distribution

- external signed registry packages;
- update, rollback, uninstall, trust-tier, and permission-diff automation.

### Stage 3: Team Calls

- brokered specialist-to-specialist calls with depth, cycle, budget, timeout,
  permission, and failure controls.

### Stage 4: Improvement System

- disposable optimization sandboxes, hidden evals, reproducible promotion
  reports, and mandatory human promotion.

## MVP Acceptance Criteria

1. `team-up` runs independently of o9k.
2. Existing o9k-roster configuration can be imported without losing model,
   CLI, limit, and effort data.
3. o9k can call `team-up` through a thin adapter.
4. Hannes and Hugo install from separate local repositories.
5. Their manifests contain no fixed provider or model names.
6. Invalid fixed-model manifests and executable hooks are rejected.
7. Human or parent agent explicitly selects a specialist ID.
8. A project-approved specialist launches without per-call human confirmation.
9. Only the selected specialist's context and dependencies reach its worker.
10. `consult`, `delegate`, and `review` produce contract-valid mailbox results.
11. The roster builds a deterministic fallback chain using subscriptions,
    credits, usage limits, and exact model tier.
12. No stronger or weaker tier is substituted automatically.
13. Unavailable profiles and worker failures return structured diagnostics.
14. Engine, specialist, adapter, and cross-specialist-isolation tests pass.

## MVP Non-Goals

- automatic semantic specialist routing;
- third-party registry installation;
- automated package updates or rollback;
- specialist-to-specialist calls;
- automatic promotion from sandbox experiments;
- remote GitHub repository creation or publication.
