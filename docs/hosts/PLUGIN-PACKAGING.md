# Host plugin packaging — spike findings (Task 11)

Spike date: 2026-07-16. Codex CLI `0.144.5`, Hermes from `~/projects/hermes-agent`, OpenCode from system `opencode`.

o9k multi-CLI init currently wires hosts via **fallback paths** (hooks.json merge, Hermes `config.yaml`, OpenCode file drop). This doc records whether each host has a viable **marketplace/plugin package** path and what it would take to adopt it.

## Summary

| Host | Marketplace / plugin install | o9k recommendation |
|------|------------------------------|----------------------|
| Claude | Claude marketplace plugins | Already primary (`wireMode: claude-plugin`) |
| **Codex** | `codex plugin marketplace` + `codex plugin add` | **Viable format, not wired** — keep `hooks.json` fallback |
| **Hermes** | `plugin.yaml` Python plugins | **Different hook system** — keep `config.yaml` shell hooks |
| **OpenCode** | `opencode plugin <npm> -g` | **File drop now**; npm publish later |
| **Cursor** | **No marketplace** | `hooks.json` + Rules/symlinks only |

No registry keys or `wire-*.mjs` branches were added in Task 11. Fallback wiring remains the supported path.

---

## Codex

### CLI surface

```text
$ codex plugin marketplace --help
Add, list, upgrade, or remove configured plugin marketplaces

Usage: codex plugin marketplace [OPTIONS] <COMMAND>

Commands:
  add      Add a local or Git marketplace to the configured marketplace sources
  list     List plugin marketplaces Codex is currently considering and their roots
  upgrade  Refresh configured Git marketplace snapshots
  remove   Remove a configured marketplace source by name
```

```text
$ codex plugin add --help
Install a plugin from a configured marketplace snapshot.

Usage: codex plugin add [OPTIONS] <PLUGIN[@MARKETPLACE]>

Examples:
  codex plugin add sample@debug
  codex plugin add sample --marketplace debug
```

### Required marketplace layout

From the bundled `openai-curated` snapshot at `~/.codex/.tmp/plugins` (read-only inspection):

```
<marketplace-root>/
  .agents/plugins/marketplace.json    # catalog manifest (required)
  plugins/<name>/
    .codex-plugin/plugin.json         # per-plugin manifest (required)
    skills/                           # optional, referenced by plugin.json
    hooks.json                        # optional, referenced by plugin.json
    .mcp.json                         # optional
```

`marketplace.json` top-level `name` becomes the marketplace identifier (`PLUGIN@MARKETPLACE`). Each plugin entry points at a local path:

```json
{
  "name": "o9k-test",
  "interface": { "displayName": "o9k test" },
  "plugins": [{
    "name": "o9k",
    "source": { "source": "local", "path": "./plugins/o9k" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "Developer Tools"
  }]
}
```

`plugin.json` (under `.codex-plugin/`) can bundle skills and hooks:

```json
{
  "name": "o9k",
  "version": "0.1.0",
  "description": "o9k spike test",
  "skills": "./skills/",
  "hooks": "./hooks.json"
}
```

Real examples: `superpowers` ships skills only; `replayio` ships `hooks.json` with `PostToolUse` / `Stop` command hooks.

### Spike transcript (isolated temp dir, cleaned up after)

Wrong manifest (root-level `marketplace.json` only):

```text
$ codex plugin marketplace add /tmp/.../marketplace
Error: invalid marketplace file `...`: marketplace root does not contain a supported manifest
```

Correct scaffold:

```text
$ codex plugin marketplace add /tmp/.../marketplace --json
{
  "marketplaceName": "o9k-test",
  "installedRoot": "/tmp/.../marketplace",
  "alreadyAdded": false
}

$ codex plugin list --marketplace o9k-test --available --json
{
  "available": [{
    "pluginId": "o9k@o9k-test",
    "name": "o9k",
    "version": "0.1.0",
    "source": { "path": "/tmp/.../marketplace/plugins/o9k" }
  }]
}

$ codex plugin add o9k@o9k-test --json
{
  "pluginId": "o9k@o9k-test",
  "installedPath": "/home/bbbee/.codex/plugins/cache/o9k-test/o9k/0.1.0"
}
```

Spike artifacts were removed (`codex plugin remove o9k@o9k-test`, `codex plugin marketplace remove o9k-test`).

### Fit for o9k skills + hooks

**Technically yes** — Codex plugins can ship both `skills/` and `hooks.json` in one bundle, installed via `codex plugin add o9k@<marketplace>`.

**Not adopted in Task 11** because:

1. o9k is a multi-pillar marketplace (o9k-core, o9k-memory, companions), not a single flat plugin folder.
2. Packaging requires a dedicated Codex marketplace scaffold (`.agents/plugins/marketplace.json` + per-pillar `.codex-plugin/plugin.json` layout) and a distribution story (Git URL vs personal `~/.agents/plugins`).
3. `wire-codex.mjs` would need a new branch: add marketplace → `codex plugin add` → verify cache paths → fall back to `hooks.json` on failure.
4. Estimated effort exceeds the &lt;2h spike budget.

**Supported path (current):** `wireMode: hooks-json` — symlink skills to `~/.codex/skills/`, merge `~/.codex/hooks.json`, install bash wrappers under `~/.codex/hooks/`.

Future registry keys (not added yet):

```json
"codex": {
  "pluginMarketplace": "bumblebiber/o9k",
  "pluginName": "o9k"
}
```

---

## Hermes

### `plugin.yaml` — what it is

Example: `plugins/platforms/teams/plugin.yaml` — platform gateway, **no hooks**:

```yaml
name: teams-platform
kind: platform
version: 1.0.0
requires_env:
  - name: TEAMS_CLIENT_ID
```

Example: `plugins/disk-cleanup/plugin.yaml` — **Python plugin** declaring hook events:

```yaml
name: disk-cleanup
version: 2.0.0
hooks:
  - post_tool_call
  - on_session_end
```

Example: `plugins/memory/byterover/plugin.yaml`:

```yaml
hooks:
  - on_pre_compress
```

Hermes discovers plugins under `plugins/**/plugin.yaml`, loads Python modules, and calls `on_<event>` handlers implemented in plugin code (see `tests/plugins/test_langfuse_plugin.py`).

### `config.yaml` — different hook system

From `hermes_cli/config.py`:

> Shell-script hooks — declarative bridge that invokes shell scripts on plugin-hook events (`pre_llm_call`, `post_tool_call`, …). Each entry maps an event name to a list of `{matcher, command, timeout}` dicts.

o9k's `wire-hermes.mjs` merges **shell command hooks** into `~/.hermes/config.yaml` under `hooks.pre_llm_call` and installs bash wrappers at `~/.hermes/agent-hooks/o9k-*.sh`.

### Can hooks ship inside a Hermes plugin?

| Mechanism | Ships in | Hook type | o9k today |
|-----------|----------|-----------|-----------|
| `plugin.yaml` `hooks:` | Python plugin package | In-process `on_pre_llm_call` etc. | No — would need a new Python Hermes plugin wrapping o9k scripts |
| `config.yaml` `hooks:` | User config | External shell commands | **Yes** — current `wire-hermes.mjs` |

`plugin.yaml` hooks **cannot** replace `config.yaml` shell hooks without rewriting o9k as a full Hermes Python plugin (new `plugins/o9k/` tree with `__init__.py`, `on_pre_llm_call`, packaging, enablement UX).

**Supported path (current):** `wireMode: hermes-yaml` — `config.yaml` merge + `agent-hooks` wrappers. `pre_llm_call` maps session-start parity; `pre_compact` is unsupported (Hermes has no equivalent).

Future registry keys (not added yet):

```json
"hermes": {
  "pluginName": "o9k"
}
```

Would require Hermes plugin packaging work, not just YAML declaration.

---

## OpenCode

### Current (supported)

`wire-opencode.mjs` writes `~/.config/opencode/plugins/o9k.ts` from template `hooks/adapters/opencode-o9k.ts`, substituting `__O9K_MARKETPLACE_ROOT__` with the absolute marketplace path. OpenCode loads TS plugins from that directory on startup.

Skills: symlinked to `~/.config/opencode/skills/` via `skills-sync.mjs`.

### Future npm path

```text
$ opencode plugin --help
opencode plugin <module>
install plugin and update config

Options:
  -g, --global      install in global config
  -f, --force       replace existing plugin version
```

Planned publish (name **TBD**, candidate `@bumblebiber/o9k-opencode`):

```bash
opencode plugin @bumblebiber/o9k-opencode -g
```

The npm module would export the same `Hooks` object as `opencode-o9k.ts`, resolving `O9K_MARKETPLACE_ROOT` from install location or env.

**Decision:** Keep file drop as primary until an npm package exists. Optional future registry flag:

```json
"opencode": {
  "npmPackage": "@bumblebiber/o9k-opencode"
}
```

`wire-opencode.mjs` would try `opencode plugin <pkg> -g` when set and `opencode` is on PATH, else file drop (pattern already sketched in Task 7 brief).

---

## Cursor

**No marketplace.** Cursor does not expose a plugin catalog or `cursor plugin install` equivalent.

Supported wiring:

- Skills: project/user Rules or symlink (no `skillDirRel` in registry — `null`)
- Hooks: merge `~/.cursor/hooks.json` (`wireMode: cursor-hooks`)
- MCP: `~/.cursor/mcp.json`
- Optional session-only: `cursor-agent --plugin-dir` (not used by o9k-init)

Do not plan marketplace packaging for Cursor.

---

## Implementation status (registry.json)

Current `hosts.*.wireMode` values unchanged:

| Host | wireMode | Packaging path |
|------|----------|----------------|
| claude | `claude-plugin` | Claude marketplace |
| codex | `hooks-json` | Fallback |
| cursor | `cursor-hooks` | Fallback (only option) |
| opencode | `opencode-plugin` | File drop |
| hermes | `hermes-yaml` | Fallback |

See `plugins/o9k-core/scripts/hosts/wire-*.mjs` and `plugins/o9k-core/compat/registry.json`.

---

## Follow-up tasks (out of scope for Task 11)

1. **Codex plugin bundle** — scaffold `.agents/plugins/marketplace.json` + o9k-core `.codex-plugin/plugin.json` in-repo or sibling repo; wire `codex plugin add` branch in `wire-codex.mjs`.
2. **Hermes Python plugin** — optional `plugins/o9k/` in hermes-agent or standalone wheel; only if shell-hook UX is insufficient.
3. **OpenCode npm** — publish `@bumblebiber/o9k-opencode`; add `hosts.opencode.npmPackage` + CLI-first branch in `wire-opencode.mjs`.
