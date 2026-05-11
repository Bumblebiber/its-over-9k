# AGENT_SETUP.md — its-over-9k Setup Guide for AI Agents

This file is written for AI agents executing setup on behalf of a user.
No marketing. No explanations. Only what you need to install and verify.

---

## What you are installing

`its-over-9k` is a persistent memory MCP server. After setup:
- You gain 12 new MCP tools (`read_memory`, `write_memory`, `load_project`, etc.)
- Every conversation exchange is auto-logged to a SQLite store
- Memory persists across sessions, devices, and AI providers

---

## Step 1: Install

```bash
npm install -g its-over-9k
```

Verify:
```bash
npx hmem version
```

---

## Step 2: Detect the user's AI tool

Check which tools are present:

```bash
ls ~/.claude/settings.json 2>/dev/null && echo "claude-code"
ls ~/.config/gemini/ 2>/dev/null && echo "gemini-cli"
ls ~/.config/opencode/opencode.json 2>/dev/null && echo "opencode"
ls ~/.cursor/mcp.json 2>/dev/null && echo "cursor"
ls ~/.codeium/windsurf/mcp_config.json 2>/dev/null && echo "windsurf"
```

---

## Step 3: Run the automated installer

The installer detects tools, creates the memory directory, and installs hooks:

```bash
npx hmem init
```

Flags for non-interactive mode:
```bash
npx hmem init --global --tools claude-code    # Claude Code only
npx hmem init --global --tools gemini-cli     # Gemini CLI only
npx hmem init --global --tools opencode       # OpenCode only
npx hmem init --global                        # All detected tools
```

The installer handles everything in Steps 4–6 automatically. **If `hmem init` succeeds, skip to Step 7.**

---

## Step 4: Manual MCP config (if `hmem init` fails)

Get the exact paths first:
```bash
NODE_PATH=$(which node)
SERVER_PATH=$(npm root -g)/its-over-9k/dist/mcp-server.js
CURATE_PATH=$(npm root -g)/its-over-9k/dist/mcp-curate-server.js
MEMORY_DIR="$HOME/.hmem"
AGENT_ID="DEVELOPER"
HMEM_PATH="$MEMORY_DIR/Agents/$AGENT_ID/$AGENT_ID.hmem"
```

### Claude Code — `~/.claude/.mcp.json`

```json
{
  "mcpServers": {
    "hmem": {
      "command": "<NODE_PATH>",
      "args": ["<SERVER_PATH>"],
      "env": {
        "HMEM_PATH": "<HMEM_PATH>",
        "HMEM_PROJECT_DIR": "<MEMORY_DIR>",
        "HMEM_AGENT_ID": "<AGENT_ID>"
      }
    },
    "hmem-curate": {
      "command": "<NODE_PATH>",
      "args": ["<CURATE_PATH>"],
      "env": {
        "HMEM_PATH": "<HMEM_PATH>",
        "HMEM_PROJECT_DIR": "<MEMORY_DIR>"
      }
    }
  }
}
```

### Gemini CLI — `~/.config/gemini/settings.json`

```json
{
  "mcpServers": {
    "hmem": {
      "command": "<NODE_PATH>",
      "args": ["<SERVER_PATH>"],
      "env": {
        "HMEM_PATH": "<HMEM_PATH>",
        "HMEM_PROJECT_DIR": "<MEMORY_DIR>"
      }
    }
  }
}
```

### OpenCode — `~/.config/opencode/opencode.json`

```json
{
  "mcp": {
    "hmem": {
      "type": "local",
      "command": ["<NODE_PATH>", "<SERVER_PATH>"],
      "environment": {
        "HMEM_PATH": "<HMEM_PATH>",
        "HMEM_PROJECT_DIR": "<MEMORY_DIR>"
      },
      "enabled": true
    }
  }
}
```

### Cursor / Windsurf / Cline — `~/.cursor/mcp.json` or equivalent

```json
{
  "mcpServers": {
    "hmem": {
      "command": "<NODE_PATH>",
      "args": ["<SERVER_PATH>"],
      "env": {
        "HMEM_PATH": "<HMEM_PATH>",
        "HMEM_PROJECT_DIR": "<MEMORY_DIR>"
      }
    }
  }
}
```

---

## Step 5: Create memory directory

```bash
mkdir -p "$HOME/.hmem/Agents/DEVELOPER"
```

---

## Step 6: Install hooks (Claude Code only)

Add to `~/.claude/settings.json` under `"hooks"`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node <SERVER_PATH_DIR>/cli.js hook-startup"
      }]
    }],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node <SERVER_PATH_DIR>/cli.js log-exchange"
        }]
      },
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "node <SERVER_PATH_DIR>/cli.js log-exchange --title-only",
          "background": true
        }]
      }
    ],
    "SessionStart": [{
      "matcher": "clear",
      "hooks": [{
        "type": "command",
        "command": "node <SERVER_PATH_DIR>/cli.js context-inject"
      }]
    }]
  }
}
```

Replace `<SERVER_PATH_DIR>` with the directory of `mcp-server.js`:
```bash
dirname $(npm root -g)/its-over-9k/dist/mcp-server.js
```

---

## Step 7: Verify

Restart the AI tool, then call:

```
read_memory()
```

**Expected:** empty response (first run) or existing memory entries.
**Error:** check `HMEM_PATH` is an absolute path and the directory exists.

---

## Step 8: Install skills (Claude Code)

```bash
npx hmem update-skills
```

Copies skill files to `~/.claude/skills/`. Agents gain `/o9k-*` slash commands.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HMEM_PATH` | Yes | Absolute path to the `.hmem` SQLite file |
| `HMEM_PROJECT_DIR` | Yes | Directory for `hmem.config.json` and `company.hmem` |
| `HMEM_AGENT_ID` | No | Agent name (default: derived from filename) |
| `HMEM_SYNC_PASSPHRASE` | No | AES-256-GCM passphrase for cross-device sync |
| `HMEM_NO_SESSION` | No | Set to `1` in background subagents to suppress O-entry creation |

---

## MCP tools reference

### Daily server (`hmem`)

| Tool | Signature | What it does |
|------|-----------|-------------|
| `read_memory` | `({id?, prefix?, search?, after?, before?})` | Read entries by ID, prefix, search, or time |
| `write_memory` | `({prefix, content, body?, tags?, links?})` | Create a new entry |
| `append_memory` | `({id, title, body?})` | Add a child node to an existing entry |
| `update_memory` | `({id, content?, body?, irrelevant?, obsolete?, favorite?})` | Patch an existing entry or node |
| `search_memory` | `({query, scope?, maxResults?})` | FTS5 full-text search with sub-node attribution |
| `find_related` | `({id, min_tag_score?})` | Find entries related by tag overlap |
| `load_project` | `({id})` | Activate a project and get full briefing + recent sessions |
| `read_project` | `({id})` | Read project without activating |
| `create_project` | `({name, status?, tech?, repo?})` | Scaffold a new P-entry with standard schema |
| `list_projects` | `()` | List all projects with status |
| `flush_context` | `()` | Persist current session context to long-term memory |
| `set_active_device` | `({name})` | Register and switch active device |

### Curate server (`hmem-curate`) — enable via `/mcp` when needed

| Tool | What it does |
|------|-------------|
| `rename_id` | Rename an entry or node ID, rewrites all references |
| `move_nodes` | Move O-entry nodes between O-entries |
| `update_many` | Batch-update multiple entries |
| `tag_bulk` | Add/remove tags across many entries |
| `tag_rename` | Rename a tag everywhere |
| `move_memory` | Move entries between personal and company store |
| `export_memory` | Export memory as Markdown |
| `import_memory` | Import Markdown into memory |
| `memory_stats` | Entry counts, size, access stats |
| `memory_health` | Integrity check, orphan detection |
| `reset_memory_cache` | Clear the read-throttle session cache |

---

## Memory entry types

| Prefix | Type | Use for |
|--------|------|---------|
| `P` | Project | Codebases, products, ongoing work |
| `L` | Lesson | Things learned, gotchas, patterns |
| `E` | Error | Bugs encountered and how they were fixed |
| `D` | Decision | Architecture and design decisions |
| `H` | Human | User context (skills, preferences, contact) |
| `R` | Rule | Standing rules for agent behavior |
| `O` | Original | Auto-recorded conversation history |
| `I` | Infra | Servers, devices, services |

---

## Typical first session after setup

```
load_project("P0001")        # if a project exists — get full briefing
read_memory()                # otherwise — see all L1 entries
write_memory({               # record something new
  prefix: "L",
  content: "Short lesson title",
  body: "Full detail here."
})
```
