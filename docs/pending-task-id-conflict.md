# Task: ID-Konflikt-Auflösung für Multi-Device Sync — IMPLEMENTED 2026-05-14

**Status:** done (Phase 1+2+3+4 alle gebaut)
**Project:** P0048 (its-over-9k / hmem-mcp)
**Memory:** P0048.8.23

## Goal

> Keine Konflikte mehr bei Onboarding und bei gleichzeitigem Bearbeiten eines Projekts von mehreren Geräten aus.

## Was vorher kaputt war

1. **Race bei `nextSeq()`** — `hmem/src/hmem-store.ts:3042` nutzt `MAX(seq)+1`, vulnerable bei offline parallel writes.
2. **Blind Upsert** — `hmem/src/sync-bridge.ts:78-105` ON CONFLICT(id) DO UPDATE ohne Timestamp-Check, last-push-wins.
3. **Kein Pull-vor-Push** — `hmem/src/cli-sync-push.ts`, `hmem-sync/cli/src/commands/push.ts` pushten ohne vorherigen Pull.
4. **Onboarding-Loch** — `hmem/src/cli-sync-setup.ts`: User mit lokaler .hmem joint Server-File mit Daten → blindes Upload+Merge ohne Warnung.
5. **conflict.ts halb-broken** — `hmem-sync/cli/src/conflict.ts:32-48` renamed nur outer `client_proposed_id`, nicht inner `data.id` → tote Renumber.

## Was gebaut wurde

### Phase 1 — Timestamp-Guard im Upsert
`hmem/src/sync-bridge.ts:87-93, 102-105`:
```sql
ON CONFLICT(id) DO UPDATE SET ...
WHERE excluded.updated_at > coalesce(memories.updated_at, '')
```
- NULL-Fallback via `coalesce(..., '')` für Pre-Migration Rows
- Strikt `>` für deterministisches Tiebreaking
- Test: `hmem/test/sync-bridge-timestamp.test.ts` (5 cases: älter rejected, neuer accepted, NULL-local, neuer Insert, equal-timestamp rejected)

### Phase 2 — Onboarding-Wizard
`hmem/src/cli-sync-setup.ts`:
- Helper `countLocalEntries(hmemPath)` — zählt `memories` mit seq>0
- Helper `clearLocalTables(hmemPath)` — DELETE memories + memory_nodes, FTS5 via `INSERT INTO hmem_fts(hmem_fts) VALUES('delete-all')` (nicht DELETE — contentless FTS)
- Wenn `existingFiles.length > 0` UND `localCount > 0` UND nicht `--join` mode:
  - **3-Option-Prompt:**
    1. Replace local with server data (default; backup nach `${hmemPath}.before-sync.${ts}.hmem` + clear + syncPull)
    2. Merge: pull-then-upload (verlässt sich auf Phase 1 LWW)
    3. Cancel
- syncPull bekam `opts.passphrase` Param zur Wiederverwendung der bereits eingegebenen Passphrase
- Test: `hmem/test/onboarding-helpers.test.ts` (6 cases)

### Phase 3 — Pull-vor-Push erzwingen
**hmem-sync repo** (`hmem-sync/cli/src/commands/`):
- `pull.ts`: extrahierte `pullFile(config, fileId, opts)` Funktion, akzeptiert optional `existingKey` zur Key-Wiederverwendung
- `push.ts`: ruft `pullFile()` mit derived key VOR export+push auf. `--no-pull` Flag für Notfälle
- `localPath()` exportiert für Wiederverwendung

**hmem repo** (`hmem/src/`):
- `cli-sync-pull.ts`: syncPull akzeptiert `opts.passphrase`
- `cli-sync-push.ts`: syncPush ruft syncPull zuerst auf (skip via `opts.skipPull`), reicht Passphrase durch

## Tests

- **hmem**: 100/100 (15 Files), davon 11 neu (5 timestamp, 6 onboarding)
- **hmem-sync**: 9/9 (4 Files), Refactor hat nichts gebrochen
- Builds clean (tsc) in beiden Repos

## Effekt auf das Ziel

**Concurrent Editing**:
- ✅ Pull-vor-Push verhindert stale-state-overwrite. B sieht A's Updates immer vor seinem Push.
- ✅ Timestamp-Guard verhindert Reverse-Overwrite bei Import. Last-Writer-by-Timestamp wins, nicht Last-Writer-by-Push-Order.

**Onboarding**:
- ✅ Default-Pfad (Option 1) ist verlustfrei: lokale .hmem wird gebackupt, dann sauber durch Server-Daten ersetzt. User kann jederzeit aus Backup wieder importieren.
- ✅ Merge-Pfad (Option 2) ist deep-merge mit Auto-Renumber: B's `P0001=MyProject` wird zu `P0002=MyProject` (inkl. Sub-Nodes + Cross-Links), A's `P0001=DifferentProject` bleibt. Beide Sets landen ohne Datenverlust. Backup zusätzlich vorhanden für Recovery.

## Phase 4 — Deep-Merge (gebaut)

`hmem/src/sync/conflict.ts` — `resolveConflicts(serverRootIds, localBlobs)`:
- Pass 1: detected Root-Collisions in memories blobs, weist via `nextFreeRoot()` nächste freie ID zu
- Pass 2: propagiert Rename auf alle Geschwister-Blobs:
  - memories: rewrite inner `data.id`
  - memory_nodes: rewrite `data.id` (root.rest → newRoot.rest), `data.root_id`, `data.parent_id`
  - ALLE blobs: cross-link rewrite in `level_1..5`, `content`, `links`, `title` via Regex `\[([A-Z]\d{4})((?:\.\d+)*)\]` — vermeidet false matches wie `[P00010]`

Option 2 Merge-Pfad in `cli-sync-setup.ts` — Funktion `mergeWithRename()`:
1. exportToStaging local SQLite
2. Pull server, decrypt, merge by numeric id
3. resolveConflicts auf localOnly
4. Write merged staging
5. Backup local hmem to `.before-sync.<ts>.hmem`
6. clearLocalTables
7. importFromStaging — sauberer Import in leere SQLite
8. exportToStaging final + push localOnly Einträge zum Server

Resultat: B's `P0001=MyProject` mit `[P0001.1]` Cross-Link wird zu `P0002=MyProject` mit `[P0002.1]`. A's `P0001=DifferentProject` bleibt. Beide landen kollisionsfrei in B's lokaler SQLite, B's renumbered Einträge gehen zum Server.

Tests:
- `hmem/test/sync-conflict.test.ts` — 9 cases (unit-level für resolveConflicts)
- `hmem/test/sync-merge-integration.test.ts` — 2 end-to-end (SQLite-Roundtrip mit clear + import)

## Affected Files (Final)

| File | Change |
|------|--------|
| `hmem/src/sync-bridge.ts` | Timestamp-Guard added to both upserts |
| `hmem/src/sync/conflict.ts` | NEW — Deep `resolveConflicts()` with sub-node + cross-link migration |
| `hmem/src/cli-sync-setup.ts` | Onboarding wizard + `mergeWithRename()` for Option 2 |
| `hmem/src/cli-sync-pull.ts` | `opts.passphrase` parameter |
| `hmem/src/cli-sync-push.ts` | Calls syncPull first |
| `hmem-sync/cli/src/commands/pull.ts` | Extracted `pullFile()` function |
| `hmem-sync/cli/src/commands/push.ts` | Calls pullFile() first, `--no-pull` flag |
| `hmem/test/sync-bridge-timestamp.test.ts` | NEW — 5 cases |
| `hmem/test/onboarding-helpers.test.ts` | NEW — 6 cases |
| `hmem/test/sync-conflict.test.ts` | NEW — 9 unit cases for resolveConflicts |
| `hmem/test/sync-merge-integration.test.ts` | NEW — 2 end-to-end SQLite roundtrip |
