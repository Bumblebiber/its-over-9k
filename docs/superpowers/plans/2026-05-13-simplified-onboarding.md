# Simplified Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate hmem-sync CLI into its-over-9k, add API key auth, and deliver a single `hmem setup` wizard that onboards new users in one command.

**Architecture:** Sync logic (api.ts, crypto.ts, config.ts) moves from `~/projects/hmem-sync/cli/src/` into `~/projects/hmem/src/sync/`. The server (`~/projects/hmem-sync/packages/server/`) gains an `api_keys` table + routes and an updated session middleware that accepts `sk-hmem-...` tokens. The web UI gains an `/settings/api-keys` page. The `hmem-sync` npm package becomes a deprecation wrapper.

**Tech Stack:** TypeScript, Hono (server), SvelteKit (web), PostgreSQL (server DB), SQLite/better-sqlite3 (local hmem), Node.js crypto (AES-256-GCM + scrypt)

**Repos:**
- Server + Web: `~/projects/hmem-sync/`
- hmem CLI: `~/projects/hmem/`

---

### Task 1: Server — API keys migration

**Files:**
- Create: `~/projects/hmem-sync/packages/server/src/migrations/007_api_keys.sql`

- [ ] **Step 1: Write migration**

```sql
-- 007_api_keys.sql
CREATE TABLE api_keys (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash   TEXT NOT NULL UNIQUE,
  prefix     TEXT NOT NULL,
  name       TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used  TIMESTAMP,
  revoked_at TIMESTAMP
);

CREATE INDEX api_keys_user_id_idx ON api_keys(user_id);
CREATE INDEX api_keys_key_hash_idx ON api_keys(key_hash);
```

- [ ] **Step 2: Apply migration locally**

```bash
cd ~/projects/hmem-sync
node -e "import('./packages/server/src/migrate.js').then(m => m.migrate()).then(() => process.exit(0))"
```

Expected: `Applied migration: 007_api_keys.sql`

- [ ] **Step 3: Verify table exists**

```bash
psql $DATABASE_URL -c "\d api_keys"
```

Expected: table with columns id, user_id, key_hash, prefix, name, created_at, last_used, revoked_at

- [ ] **Step 4: Commit**

```bash
cd ~/projects/hmem-sync
git add packages/server/src/migrations/007_api_keys.sql
git commit -m "feat: add api_keys migration"
```

---

### Task 2: Server — API key routes

**Files:**
- Create: `~/projects/hmem-sync/packages/server/src/routes/api-keys.ts`
- Modify: `~/projects/hmem-sync/packages/server/src/index.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/server/src/__tests__/auth.test.ts`:

```typescript
describe('API keys', () => {
  it('creates and lists an API key', async () => {
    const { authHeader } = await createTestSession()
    const createRes = await app.request('/api-keys', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My key' }),
    })
    expect(createRes.status).toBe(201)
    const { key, id } = await createRes.json() as { key: string; id: string }
    expect(key).toMatch(/^sk-hmem-/)

    const listRes = await app.request('/api-keys', {
      headers: { Authorization: authHeader },
    })
    expect(listRes.status).toBe(200)
    const { keys } = await listRes.json() as { keys: { id: string; prefix: string }[] }
    expect(keys.find(k => k.id === id)).toBeDefined()
    expect(keys.find(k => k.id === id)?.prefix).toMatch(/^sk-hmem-/)
  })

  it('deletes an API key', async () => {
    const { authHeader } = await createTestSession()
    const { id } = await app.request('/api-keys', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => r.json()) as { id: string }

    const delRes = await app.request(`/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    })
    expect(delRes.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/projects/hmem-sync && npm test -- --reporter=verbose 2>&1 | grep -A5 "API keys"
```

Expected: FAIL — routes don't exist yet

- [ ] **Step 3: Implement routes**

Create `packages/server/src/routes/api-keys.ts`:

```typescript
import { Hono } from 'hono'
import { randomBytes, createHash } from 'node:crypto'
import { sql } from '../db.js'

export const apiKeyRoutes = new Hono()

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = 'sk-hmem-' + randomBytes(24).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 16)  // "sk-hmem-XXXXXXXX"
  return { raw, hash, prefix }
}

// POST /api-keys — create new key (returns raw key once)
apiKeyRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({})) as { name?: string }
  const { raw, hash, prefix } = generateApiKey()

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO api_keys (user_id, key_hash, prefix, name)
    VALUES (${userId}, ${hash}, ${prefix}, ${body.name ?? null})
    RETURNING id
  `
  return c.json({ id: row.id, key: raw, prefix }, 201)
})

// GET /api-keys — list keys (never returns raw key)
apiKeyRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const keys = await sql<{ id: string; prefix: string; name: string | null; created_at: string; last_used: string | null }[]>`
    SELECT id, prefix, name, created_at, last_used
    FROM api_keys
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
  `
  return c.json({ keys })
})

// DELETE /api-keys/:id — revoke
apiKeyRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await sql`
    UPDATE api_keys SET revoked_at = NOW()
    WHERE id = ${id} AND user_id = ${userId}
  `
  return c.json({ ok: true })
})
```

- [ ] **Step 4: Register routes in index.ts**

In `packages/server/src/index.ts`, add after the existing imports and route registrations:

```typescript
import { apiKeyRoutes } from './routes/api-keys.js'
```

After `app.use('/admin/*', sessionMiddleware)`:
```typescript
app.use('/api-keys/*', sessionMiddleware)
app.route('/api-keys', apiKeyRoutes)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ~/projects/hmem-sync && npm test -- --reporter=verbose 2>&1 | grep -A5 "API keys"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/projects/hmem-sync
git add packages/server/src/routes/api-keys.ts packages/server/src/index.ts packages/server/src/__tests__/auth.test.ts
git commit -m "feat: add API key CRUD endpoints"
```

---

### Task 3: Server — session middleware accepts API keys

**Files:**
- Modify: `~/projects/hmem-sync/packages/server/src/middleware/session.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/server/src/__tests__/auth.test.ts`:

```typescript
describe('API key auth', () => {
  it('authenticates with a valid API key', async () => {
    const { authHeader } = await createTestSession()
    const { key } = await app.request('/api-keys', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    }).then(r => r.json()) as { key: string }

    const res = await app.request('/users/me', {
      headers: { Authorization: `Bearer ${key}` },
    })
    expect(res.status).toBe(200)
  })

  it('rejects revoked API key', async () => {
    const { authHeader } = await createTestSession()
    const { key, id } = await app.request('/api-keys', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => r.json()) as { key: string; id: string }

    await app.request(`/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    })

    const res = await app.request('/users/me', {
      headers: { Authorization: `Bearer ${key}` },
    })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/projects/hmem-sync && npm test -- --reporter=verbose 2>&1 | grep -A3 "API key auth"
```

Expected: FAIL

- [ ] **Step 3: Update session middleware**

Replace `packages/server/src/middleware/session.ts` entirely:

```typescript
import { createMiddleware } from 'hono/factory'
import { createHash } from 'node:crypto'
import { sql } from '../db.js'

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}

export const sessionMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = auth.slice(7)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  if (token.startsWith('sk-hmem-')) {
    // API key path
    const [key] = await sql<{ user_id: string; id: string }[]>`
      SELECT user_id, id FROM api_keys
      WHERE key_hash = ${tokenHash} AND revoked_at IS NULL
      LIMIT 1
    `
    if (!key) return c.json({ error: 'Unauthorized' }, 401)
    // Update last_used asynchronously (don't await — don't block the request)
    sql`UPDATE api_keys SET last_used = NOW() WHERE id = ${key.id}`.catch(() => {})
    c.set('userId', key.user_id)
  } else {
    // Session token path
    const [session] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM sessions
      WHERE token_hash = ${tokenHash} AND expires_at > NOW()
      LIMIT 1
    `
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    c.set('userId', session.user_id)
  }

  await next()
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/projects/hmem-sync && npm test 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd ~/projects/hmem-sync
git add packages/server/src/middleware/session.ts packages/server/src/__tests__/auth.test.ts
git commit -m "feat: session middleware accepts API keys (sk-hmem-...)"
```

---

### Task 4: Web UI — API keys settings page

**Files:**
- Create: `~/projects/hmem-sync/web/src/routes/settings/api-keys/+page.svelte`

The existing `/settings` page at `web/src/routes/settings/+page.svelte` can be used as a style reference. The web build is served by the Hono server — after changes, rebuild with `npm run build` in the web directory and restart the server.

- [ ] **Step 1: Create API keys page**

Create `web/src/routes/settings/api-keys/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { api, ApiError } from '$lib/api.js'
  import { session } from '$lib/auth.js'

  type ApiKey = { id: string; prefix: string; name: string | null; created_at: string; last_used: string | null }

  let keys = $state<ApiKey[]>([])
  let newKeyName = $state('')
  let createdKey = $state<string | null>(null)
  let error = $state('')
  let loading = $state(true)

  onMount(async () => {
    if (!$session) { goto('/'); return }
    await loadKeys()
  })

  async function loadKeys() {
    loading = true
    try {
      const res = await api.get<{ keys: ApiKey[] }>('/api-keys')
      keys = res.keys
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  }

  async function createKey() {
    try {
      const res = await api.post<{ key: string; id: string; prefix: string }>('/api-keys', { name: newKeyName || undefined })
      createdKey = res.key
      newKeyName = ''
      await loadKeys()
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Failed to create'
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this key? This cannot be undone.')) return
    try {
      await api.delete(`/api-keys/${id}`)
      await loadKeys()
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Failed to revoke'
    }
  }
</script>

<svelte:head><title>API Keys — hmem-sync</title></svelte:head>

<main>
  <div class="page-header animate-in">
    <div><h1>API Keys</h1><p>Use these keys to authenticate the hmem CLI</p></div>
    <a href="/settings" class="btn btn-secondary">← Settings</a>
  </div>

  {#if error}<div class="alert error animate-in">{error}</div>{/if}

  {#if createdKey}
  <div class="alert success animate-in" style="margin-bottom:1rem">
    <strong>Key created — copy it now, it won't be shown again:</strong>
    <pre class="mono" style="margin-top:0.5rem;user-select:all">{createdKey}</pre>
    <button class="btn btn-secondary" onclick={() => { navigator.clipboard.writeText(createdKey!); }}>Copy</button>
    <button class="btn btn-secondary" style="margin-left:0.5rem" onclick={() => createdKey = null}>Dismiss</button>
  </div>
  {/if}

  <div class="card animate-in" style="margin-bottom:1.5rem">
    <div class="card-header"><h3>Create new key</h3></div>
    <div class="field">
      <label>Name (optional)</label>
      <input type="text" bind:value={newKeyName} placeholder="e.g. Strato Server" />
    </div>
    <button class="btn btn-primary" onclick={createKey}>Generate key</button>
  </div>

  <div class="card animate-in">
    <div class="card-header"><h3>Active keys</h3></div>
    {#if loading}
      <p style="padding:1rem;color:var(--text-muted)">Loading...</p>
    {:else if keys.length === 0}
      <p style="padding:1rem;color:var(--text-muted)">No API keys yet.</p>
    {:else}
      {#each keys as k}
      <div class="field" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span class="mono">{k.prefix}...</span>
          {#if k.name}<span style="margin-left:0.75rem;color:var(--text-muted)">{k.name}</span>{/if}
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem">
            Created {new Date(k.created_at).toLocaleDateString()}
            {#if k.last_used} · Last used {new Date(k.last_used).toLocaleDateString()}{/if}
          </div>
        </div>
        <button class="btn btn-danger" onclick={() => revokeKey(k.id)}>Revoke</button>
      </div>
      {/each}
    {/if}
  </div>
</main>
```

- [ ] **Step 2: Add link to API keys page in settings**

In `web/src/routes/settings/+page.svelte`, after the Account card, add:

```svelte
  <div class="card animate-in" style="margin-bottom:1.5rem">
    <div class="card-header"><h3>API Keys</h3></div>
    <p style="color:var(--text-muted);margin-bottom:1rem">Manage keys for the hmem CLI (hmem setup).</p>
    <a href="/settings/api-keys" class="btn btn-secondary">Manage API keys →</a>
  </div>
```

Find the right spot by looking for `{#if user}` in that file and adding after the Account card `</div>`.

- [ ] **Step 3: Build web and restart server**

```bash
cd ~/projects/hmem-sync/web && npm run build
sudo systemctl restart hmem-sync
```

Expected: Build completes without errors, server restarts

- [ ] **Step 4: Verify page loads**

```bash
curl -s http://localhost:3100/settings/api-keys | grep -o "API Keys"
```

Expected: `API Keys` (SvelteKit SPA — page served as index.html, client handles routing)

- [ ] **Step 5: Commit**

```bash
cd ~/projects/hmem-sync
git add web/src/routes/settings/api-keys/+page.svelte web/src/routes/settings/+page.svelte
git commit -m "feat: add API keys settings page"
```

---

### Task 5: its-over-9k — sync module

**Files:**
- Create: `~/projects/hmem/src/sync/api.ts`
- Create: `~/projects/hmem/src/sync/crypto.ts` (copy + minor edits from hmem-sync)
- Create: `~/projects/hmem/src/sync/config.ts`
- Create: `~/projects/hmem/src/sync/passphrase.ts`

These are ported from `~/projects/hmem-sync/cli/src/` with adaptations.

- [ ] **Step 1: Create sync directory and copy crypto**

The crypto module is identical to hmem-sync's. Copy it:

```bash
mkdir -p ~/projects/hmem/src/sync
cp ~/projects/hmem-sync/cli/src/crypto.ts ~/projects/hmem/src/sync/crypto.ts
cp ~/projects/hmem-sync/cli/src/passphrase.ts ~/projects/hmem/src/sync/passphrase.ts
```

- [ ] **Step 2: Create config.ts**

Create `~/projects/hmem/src/sync/config.ts`:

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export interface FileSyncConfig {
  passphrase_hint?: string
  last_sync?: string
  salt?: string
  hmem_path?: string  // Auto-detected SQLite path
}

export interface SyncConfig {
  server: string
  api_key?: string
  files: Record<string, FileSyncConfig>
  active_file?: string
}

const DEFAULT_CONFIG: SyncConfig = {
  server: 'https://hmem-sync.io',
  files: {},
}

export function configDir(): string {
  return join(process.env.HOME ?? process.env.USERPROFILE ?? '~', '.hmem')
}

export function getConfigPath(): string {
  return join(configDir(), 'config.json')
}

export async function loadSyncConfig(): Promise<SyncConfig> {
  const path = getConfigPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as Partial<SyncConfig>
  return { ...DEFAULT_CONFIG, ...parsed, files: parsed.files ?? {} }
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  const dir = configDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2), { mode: 0o600 })
}
```

- [ ] **Step 3: Create api.ts**

Create `~/projects/hmem/src/sync/api.ts`:

```typescript
export class SyncApiError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'SyncApiError'
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

interface PushBlob {
  proposed_id: string
  data: string
  device_id: string
  updated_at: string
}

interface PushRequest {
  file_id: string
  idempotency_key: string
  blobs: PushBlob[]
}

interface PushResponse {
  mappings: { proposed_id: string; final_id: number }[]
}

interface PullBlob {
  id: number
  client_proposed_id?: string
  data: string
  deleted_at?: string | null
  updated_at: string
}

interface PullResponse {
  blobs: PullBlob[]
  server_time: string
  salt?: string
}

export interface HmemFile {
  id: string
  salt?: string
}

export class HmemSyncClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers as Record<string, string> ?? {}),
        },
      })
      const data = await res.json()
      if (!res.ok) {
        const d = data as { error?: string; details?: unknown }
        const detail = d.details ? ` | ${JSON.stringify(d.details).slice(0, 200)}` : ''
        return { ok: false, status: res.status, error: (d.error ?? 'Unknown error') + detail }
      }
      return { ok: true, data: data as T }
    } catch (e) {
      return { ok: false, status: 0, error: (e as Error).message }
    }
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch { return false }
  }

  async listFiles(): Promise<HmemFile[]> {
    const r = await this.request<{ files: HmemFile[] }>('/files')
    if (!r.ok) {
      if (r.status === 402) throw new SyncApiError('Subscription required', 'PAYMENT_REQUIRED')
      throw new Error(r.error)
    }
    return r.data.files
  }

  async createFile(id: string, salt: string): Promise<HmemFile> {
    const r = await this.request<HmemFile>('/files', {
      method: 'POST',
      body: JSON.stringify({ id, owner_type: 'personal', salt }),
    })
    if (!r.ok) {
      if (r.status === 409) throw new SyncApiError('File already exists', 'CONFLICT')
      if (r.status === 402) throw new SyncApiError('Subscription required', 'PAYMENT_REQUIRED')
      throw new Error(r.error)
    }
    return r.data
  }

  async push(req: PushRequest): Promise<PushResponse> {
    const r = await this.request<PushResponse>('/sync/push', {
      method: 'POST',
      body: JSON.stringify(req),
    })
    if (!r.ok) {
      if (r.status === 403) throw new SyncApiError('Access revoked', 'REVOKED')
      if (r.status === 402) throw new SyncApiError('Subscription required', 'PAYMENT_REQUIRED')
      throw new Error(r.error)
    }
    return r.data
  }

  async pull(fileId: string, since?: string): Promise<PullResponse> {
    const qs = since
      ? `?file_id=${encodeURIComponent(fileId)}&since=${encodeURIComponent(since)}`
      : `?file_id=${encodeURIComponent(fileId)}`
    const r = await this.request<PullResponse>(`/sync/pull${qs}`)
    if (!r.ok) {
      if (r.status === 403) throw new SyncApiError('Access revoked', 'REVOKED')
      if (r.status === 402) throw new SyncApiError('Subscription required', 'PAYMENT_REQUIRED')
      throw new Error(r.error)
    }
    return r.data
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd ~/projects/hmem && npm run build 2>&1 | head -30
```

Expected: no errors from sync/*.ts files

- [ ] **Step 5: Commit**

```bash
cd ~/projects/hmem
git add src/sync/
git commit -m "feat: add sync module (api, crypto, config, passphrase)"
```

---

### Task 6: its-over-9k — `hmem setup` wizard

**Files:**
- Create: `~/projects/hmem/src/cli-sync-setup.ts`

- [ ] **Step 1: Implement setup wizard**

Create `~/projects/hmem/src/cli-sync-setup.ts`:

```typescript
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, hostname } from 'node:os'
import { loadSyncConfig, saveSyncConfig, configDir } from './sync/config.js'
import { HmemSyncClient, SyncApiError } from './sync/api.js'
import { generateKeyMaterial, deriveKey, encrypt } from './sync/crypto.js'
import { exportToStaging } from './sync-bridge.js'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

function isSQLite(filePath: string): boolean {
  try {
    const buf = readFileSync(filePath).subarray(0, 16)
    return buf.toString('utf8', 0, 15) === 'SQLite format 3'
  } catch { return false }
}

function findHmemFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findHmemFiles(full))
      } else if (entry.name.endsWith('.hmem') && isSQLite(full)) {
        results.push(full)
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results
}

export async function runSetup(opts: { join?: boolean }) {
  const rl = createInterface({ input, output })
  const ask = (prompt: string) => rl.question(prompt)

  console.log('\nWelcome to hmem sync setup!\n')

  // Step 1: Server URL
  const config = await loadSyncConfig()
  const serverAnswer = await ask(`[1/4] Sync server [${config.server}]: `)
  const server = serverAnswer.trim() || config.server

  // Step 2: API key
  console.log(`\n  Get your API key at: ${server}/settings/api-keys`)
  let apiKey = (await ask('  API key: ')).trim()
  if (!apiKey && config.api_key) {
    console.log('  (using existing API key from config)')
    apiKey = config.api_key
  }
  if (!apiKey) { console.error('API key is required'); rl.close(); process.exit(1) }

  const client = new HmemSyncClient(server, apiKey)
  const healthy = await client.health()
  if (!healthy) { console.error(`\n  Cannot reach server at ${server}`); rl.close(); process.exit(1) }

  // Step 3: Memory file + passphrase
  const hmemDir = join(homedir(), '.hmem')
  const found = findHmemFiles(hmemDir)

  let hmemPath: string | undefined
  if (found.length === 1) {
    console.log(`\n[3/4] Memory file`)
    console.log(`  Found: ${found[0]}`)
    hmemPath = found[0]
  } else if (found.length > 1) {
    console.log(`\n[3/4] Memory file — multiple found:`)
    found.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
    const idx = parseInt(await ask('  Choose [1]: ')) - 1 || 0
    hmemPath = found[Math.max(0, Math.min(idx, found.length - 1))]
  } else {
    console.log(`\n[3/4] Memory file`)
    console.log('  No .hmem file found — will create empty sync file')
  }

  const passphraseAnswer = (await ask('  Passphrase for encryption: ')).trim()
  if (!passphraseAnswer) { console.error('Passphrase is required'); rl.close(); process.exit(1) }

  // Step 4: Create or activate file on server
  console.log('\n[4/4] Server file')
  let fileId: string
  let salt: string

  const existingFiles = await client.listFiles()

  if (opts.join && existingFiles.length > 0) {
    // Join mode: activate existing file
    const file = existingFiles[0]
    fileId = file.id
    salt = file.salt!
    console.log(`  Activating existing file: ${fileId}`)
  } else if (existingFiles.length > 0) {
    // Activate existing
    const file = existingFiles[0]
    fileId = file.id
    salt = file.salt!
    console.log(`  Using existing server file: ${fileId}`)
  } else {
    // Create new
    const { salt: newSalt, recoveryKey } = generateKeyMaterial()
    salt = newSalt
    console.log(`\n  Recovery key (save this now!):`)
    console.log(`  ${recoveryKey}`)
    await ask('  Press Enter once saved: ')

    try {
      const file = await client.createFile('personal', salt)
      fileId = file.id
      console.log(`  Created file: ${fileId}`)
    } catch (e) {
      if (e instanceof SyncApiError && e.code === 'CONFLICT') {
        const files = await client.listFiles()
        fileId = files[0].id
        salt = files[0].salt!
        console.log(`  Using existing file: ${fileId}`)
      } else throw e
    }
  }

  // Save config
  config.server = server
  config.api_key = apiKey
  config.active_file = fileId
  config.files[fileId] = { ...config.files[fileId], salt, hmem_path: hmemPath }
  await saveSyncConfig(config)

  // Upload prompt
  if (hmemPath && !opts.join) {
    const upload = (await ask('\n  Upload existing memory to server? [Y/n]: ')).trim().toLowerCase()
    if (upload !== 'n') {
      console.log('  Exporting...')
      const stagingPath = join(configDir(), `${fileId}.hmem`)
      await exportToStaging(hmemPath, stagingPath)

      const blobsRaw = JSON.parse(await readFile(stagingPath, 'utf8')) as Array<{
        id?: number; client_proposed_id?: string; data: string; updated_at?: string
      }>
      const key = deriveKey(passphraseAnswer, salt)
      const BATCH = 500
      let total = 0

      for (let i = 0; i < blobsRaw.length; i += BATCH) {
        const batch = blobsRaw.slice(i, i + BATCH).map((b) => ({
          proposed_id: b.client_proposed_id ?? String(b.id ?? randomUUID()),
          data: encrypt(b.data, key),
          device_id: hostname(),
          updated_at: b.updated_at ?? new Date().toISOString(),
        }))
        const res = await client.push({ file_id: fileId, idempotency_key: randomUUID(), blobs: batch })
        total += res.mappings.length
        process.stdout.write(`\r  ${total}/${blobsRaw.length} blobs uploaded...`)
      }
      console.log(`\n  ✓ Uploaded ${total} blobs`)
    }
  }

  rl.close()
  console.log('\n✓ Setup complete!')
  if (opts.join) {
    console.log('  Running pull to download memory...')
    process.exit(0)  // caller (cli.ts) will run pull after setup --join
  }
}
```

- [ ] **Step 2: Build to verify no type errors**

```bash
cd ~/projects/hmem && npm run build 2>&1 | grep -E "error|warning" | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd ~/projects/hmem
git add src/cli-sync-setup.ts
git commit -m "feat: add hmem setup wizard"
```

---

### Task 7: its-over-9k — `hmem sync push`

**Files:**
- Create: `~/projects/hmem/src/cli-sync-push.ts`

- [ ] **Step 1: Implement push command**

Create `~/projects/hmem/src/cli-sync-push.ts`:

```typescript
import { loadSyncConfig, saveSyncConfig, configDir } from './sync/config.js'
import { HmemSyncClient, SyncApiError } from './sync/api.js'
import { deriveKey, encrypt } from './sync/crypto.js'
import { getPassphrase } from './sync/passphrase.js'
import { exportToStaging } from './sync-bridge.js'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'

export async function syncPush() {
  const config = await loadSyncConfig()
  if (!config.api_key) { console.error('Not configured. Run: hmem setup'); process.exit(1) }

  const fileId = config.active_file
  if (!fileId) { console.error('No active file. Run: hmem setup'); process.exit(1) }

  const fileCfg = config.files[fileId] ?? {}
  const salt = fileCfg.salt
  if (!salt) { console.error(`No salt for "${fileId}". Run: hmem setup`); process.exit(1) }

  // Auto-export SQLite → staging JSON if hmem_path is set
  const stagingPath = join(configDir(), `${fileId}.hmem`)
  if (fileCfg.hmem_path) {
    await exportToStaging(fileCfg.hmem_path, stagingPath)
  }

  if (!existsSync(stagingPath)) {
    console.error(`No local data found. Run: hmem setup`)
    process.exit(1)
  }

  let blobs: Array<{ id?: number; client_proposed_id?: string; data: string; updated_at?: string }>
  try {
    blobs = JSON.parse(await readFile(stagingPath, 'utf8')) as typeof blobs
  } catch {
    console.error('Local data corrupted. Run: hmem setup')
    process.exit(1)
  }

  if (blobs.length === 0) { console.log('Nothing to push.'); return }

  const passphrase = await getPassphrase(fileCfg.passphrase_hint)
  const key = deriveKey(passphrase, salt)
  const client = new HmemSyncClient(config.server, config.api_key)

  const encoded = blobs.map((b) => ({
    proposed_id: b.client_proposed_id ?? String(b.id ?? randomUUID()),
    data: encrypt(b.data, key),
    device_id: hostname(),
    updated_at: b.updated_at ?? new Date().toISOString(),
  }))

  const BATCH = 500
  let total = 0
  for (let i = 0; i < encoded.length; i += BATCH) {
    const batch = encoded.slice(i, i + BATCH)
    try {
      const res = await client.push({ file_id: fileId, idempotency_key: randomUUID(), blobs: batch })
      total += res.mappings.length
      if (encoded.length > BATCH) process.stdout.write(`\r  ${total}/${encoded.length} blobs...`)
    } catch (err) {
      if (err instanceof SyncApiError && err.code === 'PAYMENT_REQUIRED') {
        console.error('\nSubscription required.')
        process.exit(1)
      }
      throw err
    }
  }

  if (encoded.length > BATCH) process.stdout.write('\n')
  console.log(`✓ Pushed ${total} blobs`)
}
```

- [ ] **Step 2: Build**

```bash
cd ~/projects/hmem && npm run build 2>&1 | grep error | head -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd ~/projects/hmem
git add src/cli-sync-push.ts
git commit -m "feat: add hmem sync push command"
```

---

### Task 8: its-over-9k — `hmem sync pull`

**Files:**
- Create: `~/projects/hmem/src/cli-sync-pull.ts`

- [ ] **Step 1: Implement pull command**

Create `~/projects/hmem/src/cli-sync-pull.ts`:

```typescript
import { loadSyncConfig, saveSyncConfig, configDir } from './sync/config.js'
import { HmemSyncClient, SyncApiError } from './sync/api.js'
import { deriveKey, decrypt } from './sync/crypto.js'
import { getPassphrase } from './sync/passphrase.js'
import { importFromStaging } from './sync-bridge.js'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export async function syncPull() {
  const config = await loadSyncConfig()
  if (!config.api_key) { console.error('Not configured. Run: hmem setup'); process.exit(1) }

  const fileId = config.active_file
  if (!fileId) { console.error('No active file. Run: hmem setup'); process.exit(1) }

  const fileCfg = config.files[fileId] ?? {}
  const client = new HmemSyncClient(config.server, config.api_key)

  let response
  try {
    response = await client.pull(fileId, fileCfg.last_sync)
  } catch (err) {
    if (err instanceof SyncApiError && err.code === 'PAYMENT_REQUIRED') {
      console.error('Subscription required.')
      process.exit(1)
    }
    throw err
  }

  const salt = response.salt ?? fileCfg.salt
  if (!salt) { console.error('No salt available. Run: hmem setup'); process.exit(1) }

  const passphrase = await getPassphrase(fileCfg.passphrase_hint)
  const key = deriveKey(passphrase, salt)

  type RawBlob = { id: number; client_proposed_id?: string; data: string; deleted_at?: string | null; updated_at: string }
  let decryptedBlobs: RawBlob[]
  try {
    decryptedBlobs = response.blobs.map((b: RawBlob) => ({
      ...b,
      data: b.deleted_at ? b.data : decrypt(b.data, key),
    }))
  } catch {
    console.error('Decryption failed — wrong passphrase?')
    process.exit(1)
  }

  const stagingPath = join(configDir(), `${fileId}.hmem`)
  let localBlobs: RawBlob[] = []
  if (existsSync(stagingPath)) {
    try {
      localBlobs = JSON.parse(await readFile(stagingPath, 'utf8')) as RawBlob[]
    } catch { localBlobs = [] }
  }

  const map = new Map<number, RawBlob>(
    localBlobs.filter(b => typeof b.id === 'number').map(b => [b.id, b])
  )
  for (const blob of decryptedBlobs) {
    if (blob.deleted_at) map.delete(blob.id)
    else map.set(blob.id, blob)
  }

  await writeFile(stagingPath, JSON.stringify([...map.values()], null, 2))

  if (fileCfg.hmem_path) {
    await importFromStaging(stagingPath, fileCfg.hmem_path)
    console.log(`✓ Pulled ${response.blobs.length} updates → imported to ${fileCfg.hmem_path}`)
  } else {
    console.log(`✓ Pulled ${response.blobs.length} updates`)
  }

  config.files[fileId] = { ...fileCfg, last_sync: response.server_time, salt }
  await saveSyncConfig(config)
}
```

- [ ] **Step 2: Build**

```bash
cd ~/projects/hmem && npm run build 2>&1 | grep error | head -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd ~/projects/hmem
git add src/cli-sync-pull.ts
git commit -m "feat: add hmem sync pull command"
```

---

### Task 9: its-over-9k — `hmem sync status` + wire up cli.ts

**Files:**
- Create: `~/projects/hmem/src/cli-sync-status.ts`
- Modify: `~/projects/hmem/src/cli.ts`

- [ ] **Step 1: Create status command**

Create `~/projects/hmem/src/cli-sync-status.ts`:

```typescript
import { loadSyncConfig } from './sync/config.js'
import { HmemSyncClient } from './sync/api.js'

export async function syncStatus() {
  const config = await loadSyncConfig()
  const fileId = config.active_file

  console.log(`Server: ${config.server}`)
  console.log(`Auth:   ${config.api_key ? 'API key configured' : 'NOT configured — run: hmem setup'}`)
  console.log(`File:   ${fileId ?? 'none — run: hmem setup'}`)

  if (config.api_key && fileId) {
    const fileCfg = config.files[fileId] ?? {}
    const client = new HmemSyncClient(config.server, config.api_key)
    const reachable = await client.health()
    console.log(`Online: ${reachable ? 'yes' : 'no — server unreachable'}`)
    if (fileCfg.last_sync) console.log(`Last sync: ${new Date(fileCfg.last_sync).toLocaleString()}`)
    if (fileCfg.hmem_path) console.log(`Local .hmem: ${fileCfg.hmem_path}`)
  }
}
```

- [ ] **Step 2: Wire up all sync commands in cli.ts**

In `~/projects/hmem/src/cli.ts`, find the `default:` case at the end of the switch statement and add before it:

```typescript
  case "setup": {
    const { runSetup } = await import("./cli-sync-setup.js");
    await runSetup({ join: process.argv.includes("--join") });
    break;
  }
  case "sync": {
    const subCmd = process.argv[3];
    if (subCmd === "push") {
      const { syncPush } = await import("./cli-sync-push.js");
      await syncPush();
    } else if (subCmd === "pull") {
      const { syncPull } = await import("./cli-sync-pull.js");
      await syncPull();
    } else if (subCmd === "status") {
      const { syncStatus } = await import("./cli-sync-status.js");
      await syncStatus();
    } else if (subCmd === "setup") {
      const { runSetup } = await import("./cli-sync-setup.js");
      await runSetup({ join: process.argv.includes("--join") });
    } else {
      console.error("Usage: hmem sync <push|pull|status|setup>");
      process.exit(1);
    }
    break;
  }
```

Note: `process.argv[2]` is the command (e.g. "sync"), `process.argv[3]` is the subcommand.

- [ ] **Step 3: Build**

```bash
cd ~/projects/hmem && npm run build 2>&1 | grep -E "^.*error" | head -20
```

Expected: no errors

- [ ] **Step 4: Smoke test**

```bash
node ~/projects/hmem/dist/cli.js sync status
```

Expected: Shows server URL + auth status (not configured yet is fine)

- [ ] **Step 5: Bump version to 1.1.0**

In `~/projects/hmem/package.json`, change `"version": "1.0.4"` to `"version": "1.1.0"`.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/hmem
git add src/cli-sync-status.ts src/cli.ts package.json
git commit -m "feat: wire up hmem setup + hmem sync push/pull/status (v1.1.0)"
```

---

### Task 10: Deploy server + publish packages

- [ ] **Step 1: Deploy server migrations to production**

```bash
cd ~/projects/hmem-sync
sudo systemctl stop hmem-sync
node packages/server/src/migrate.js
sudo systemctl start hmem-sync
```

Expected: `Applied migration: 007_api_keys.sql` then server starts

- [ ] **Step 2: Publish its-over-9k@1.1.0**

```bash
cd ~/projects/hmem && npm publish
```

Expected: `+ its-over-9k@1.1.0`

- [ ] **Step 3: Publish hmem-sync deprecation wrapper**

In `~/projects/hmem-sync/cli/`, create or replace the main entry point with a deprecation message.

First check current version:
```bash
cat ~/projects/hmem-sync/cli/package.json | grep version
```

Update `~/projects/hmem-sync/cli/package.json` version to `3.0.0`.

Replace `~/projects/hmem-sync/cli/src/cli.ts` (the bin entry point — `bin.hmem-sync` points to `dist/cli.js` built from this file) with:

```typescript
#!/usr/bin/env node
console.error('⚠ hmem-sync is deprecated.')
console.error('  Sync is now built into its-over-9k:')
console.error('')
console.error('  npm update -g its-over-9k')
console.error('  hmem setup')
process.exit(0)
```

Build and publish:
```bash
cd ~/projects/hmem-sync/cli && npm run build && npm publish
```

Expected: `+ hmem-sync@3.0.0`

- [ ] **Step 4: Verify setup works end-to-end on Strato**

```bash
hmem sync status
```

Expected: Shows current server + file config

```bash
hmem sync push
```

Expected: Pushes blobs successfully (will prompt for passphrase)

- [ ] **Step 5: Final commit**

```bash
cd ~/projects/hmem-sync
git add cli/package.json cli/src/
git commit -m "feat: deprecate hmem-sync CLI — sync moved to its-over-9k"
```
