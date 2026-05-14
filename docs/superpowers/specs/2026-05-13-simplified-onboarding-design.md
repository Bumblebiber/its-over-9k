# Simplified Onboarding Design

**Date:** 2026-05-13
**Project:** its-over-9k (hmem)
**Status:** Approved

## Problem

The current hmem-sync setup required multiple separate packages (`its-over-9k` + `hmem-sync`), a fragile magic-link CLI auth flow with three separate bugs, and manual configuration of `hmem_path` in JSON. This made first-time setup unreliable and too complex for commercial adoption.

## Goals

- One command (`hmem setup`) to go from zero to Memory + Sync running
- No version mismatch bugs between packages
- API-key auth instead of magic link — no browser polling, no handshake bugs
- Auto-detect existing `.hmem` file, ask user before uploading

## Architecture

```
its-over-9k (npm package)
├── hmem CLI (dist/cli.js)
│   ├── hmem setup          ← new: full onboarding wizard
│   ├── hmem sync push      ← new: replaces hmem-sync push
│   ├── hmem sync pull      ← new: replaces hmem-sync pull
│   └── ... (existing commands)
├── src/sync/               ← new: moved from hmem-sync package
│   ├── api.ts              ← HmemApiClient
│   ├── crypto.ts           ← AES-256-GCM
│   └── config.ts           ← sync config read/write
└── src/sync-bridge.ts      ← unchanged (SQLite ↔ JSON)

hmem-sync (npm package)     ← deprecated, points to its-over-9k
```

Config: everything in `~/.hmem/config.json`. No second config file.
Server: hmem-sync.io backend gets API key support added (new endpoints + middleware). Magic link auth remains for web UI login.

## `hmem setup` Wizard

```
$ hmem setup

[1/4] Sync server
  Server URL [https://hmem-sync.io]: ↵

[2/4] API key
  Get your API key at: https://hmem-sync.io/settings/api-keys
  API key: sk-hmem-••••••••

[3/4] Memory file
  ✓ Found: ~/.hmem/Agents/DEVELOPER/DEVELOPER.hmem (633 entries)
  Passphrase for encryption: ••••••••
  Recovery key (save this now!): XXXX-XXXX-XXXX-XXXX
  Press Enter once saved: ↵

[4/4] Upload
  Upload existing memory to server? [Y/n]: Y
  ████████████████████ 14007/14007 blobs ✓

✓ Done! Sync is running.
  Second device: hmem setup --join
```

**Key decisions:**
- API key replaces magic link — zero browser interaction needed
- Auto-detects the `.hmem` SQLite file; no manual `hmem_path` config
- Recovery key shown and confirmed before upload begins
- `--join` flag on second device: enter API key + passphrase, then pull

## `hmem sync` Commands

```bash
hmem sync push      # SQLite → JSON → encrypt → batch upload (500/req)
hmem sync pull      # download → decrypt → JSON → SQLite import
hmem sync status    # shows: last sync timestamp, blob count, server reachable?
hmem sync setup     # alias for hmem setup
```

**Delta pull:** Pull sends `since: last_sync` timestamp — only new/changed blobs are transferred. Today's full-pull on 14k blobs becomes a near-instant delta on subsequent syncs.

**Push batch:** 500 blobs per request with progress counter (unchanged from today's fix).

## Migration

**`hmem-sync` package:** Published as `hmem-sync@3.0.0` — deprecation wrapper only:
```
⚠ hmem-sync is deprecated. Switch to: npm install -g its-over-9k
  Sync is now built in: hmem setup
```

**Existing `~/.hmem/config.json`:** Automatically recognized and retained — `session_token`, `files`, `active_file` carry over. No manual migration needed.

## Release Plan

- `its-over-9k@1.1.0` — sync integrated, `hmem setup` wizard, `hmem sync push/pull`
- `hmem-sync@3.0.0` — deprecation wrapper only

## Server Changes (hmem-sync backend)

New API key endpoints:
- `POST /auth/api-keys` — generate a new key (returns `sk-hmem-...`)
- `GET /auth/api-keys` — list user's keys
- `DELETE /auth/api-keys/:id` — revoke a key

Auth middleware update: accept `Authorization: Bearer sk-hmem-...` as API key in addition to session tokens.

Web UI: `/settings/api-keys` page — list keys, create new, revoke. Accessible after magic-link login.

## Out of Scope

- hCaptcha in web UI (separate task P0048.8.20.31)
- Billing / Stripe (P0048.8.20.29, .30)
- OAuth (GitHub/Google) login — API key is sufficient for v1.1
- MCP-server-native sync (Option 3) — future consideration
