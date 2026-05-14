export interface LocalBlob {
  id?: number | string
  client_proposed_id?: string
  data: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

export interface ConflictResolution {
  blobs: LocalBlob[]
  renameMap: Record<string, string>
  renamedCount: number
}

const ROOT_RE = /^([A-Z])(\d{4})$/
const NODE_RE = /^([A-Z])(\d{4})((?:\.\d+)+)$/

function rootOf(id: string): string | null {
  const m = id.match(ROOT_RE) ?? id.match(NODE_RE)
  if (!m) return null
  return `${m[1]}${m[2]}`
}

function nextFreeRoot(prefix: string, taken: Set<string>): string {
  let n = 1
  let candidate = `${prefix}${String(n).padStart(4, '0')}`
  while (taken.has(candidate)) {
    n++
    candidate = `${prefix}${String(n).padStart(4, '0')}`
  }
  return candidate
}

function rewriteIdField(id: string, renameMap: Record<string, string>): string {
  const root = rootOf(id)
  if (!root || !(root in renameMap)) return id
  return renameMap[root] + id.slice(root.length)
}

function rewriteCrossLinks(text: unknown, renameMap: Record<string, string>): unknown {
  if (typeof text !== 'string') return text
  if (Object.keys(renameMap).length === 0) return text
  return text.replace(/\[([A-Z]\d{4})((?:\.\d+)*)\]/g, (full, root, suffix) => {
    const newRoot = renameMap[root]
    return newRoot ? `[${newRoot}${suffix}]` : full
  })
}

function rewriteRowFields(row: Record<string, unknown>, renameMap: Record<string, string>): void {
  const tableFields =
    row._table === 'memories'
      ? ['level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'links', 'title']
      : ['content', 'title']
  for (const f of tableFields) {
    if (f in row) row[f] = rewriteCrossLinks(row[f], renameMap)
  }
}

/**
 * Resolve ID conflicts between local-only blobs and server-side proposed IDs.
 *
 * Steps:
 *  1. Identify root-collisions (local memories blob with id ∈ serverRootIds).
 *  2. Assign next free root ID per collision (avoiding both server + already-assigned).
 *  3. Rewrite every local blob: data.id, data.root_id, data.parent_id (memory_nodes),
 *     outer client_proposed_id, and cross-link references [P00XX] / [P00XX.y.z] in body text.
 *  4. Return all blobs (renamed + unchanged-id-but-body-rewritten) plus the rename map.
 */
export function resolveConflicts(
  serverRootIds: Set<string>,
  localBlobs: LocalBlob[],
): ConflictResolution {
  const renameMap: Record<string, string> = {}
  const taken = new Set<string>(serverRootIds)

  // Pass 1 — collect rename map for memories blobs whose root id collides.
  for (const blob of localBlobs) {
    if (typeof blob.id === 'number') continue
    let row: Record<string, unknown>
    try {
      row = JSON.parse(blob.data) as Record<string, unknown>
    } catch {
      continue
    }
    if (row._table !== 'memories') continue
    const id = String(row.id ?? blob.client_proposed_id ?? blob.id ?? '')
    const m = id.match(ROOT_RE)
    if (!m) continue
    if (!serverRootIds.has(id)) {
      taken.add(id)
      continue
    }
    const newId = nextFreeRoot(m[1], taken)
    renameMap[id] = newId
    taken.add(newId)
  }

  // Pass 2 — rewrite every local blob.
  const rewritten: LocalBlob[] = []
  for (const blob of localBlobs) {
    if (typeof blob.id === 'number') {
      rewritten.push(blob)
      continue
    }
    let row: Record<string, unknown>
    try {
      row = JSON.parse(blob.data) as Record<string, unknown>
    } catch {
      rewritten.push(blob)
      continue
    }

    if (typeof row.id === 'string') {
      const newRowId = rewriteIdField(row.id, renameMap)
      if (newRowId !== row.id) row.id = newRowId
    }
    if (row._table === 'memory_nodes') {
      if (typeof row.root_id === 'string' && row.root_id in renameMap) {
        row.root_id = renameMap[row.root_id as string]
      }
      if (typeof row.parent_id === 'string') {
        row.parent_id = rewriteIdField(row.parent_id, renameMap)
      }
    }
    rewriteRowFields(row, renameMap)

    const newOuterId =
      typeof blob.client_proposed_id === 'string'
        ? rewriteIdField(blob.client_proposed_id, renameMap)
        : blob.client_proposed_id
    rewritten.push({
      ...blob,
      client_proposed_id: newOuterId,
      data: JSON.stringify(row),
    })
  }

  return {
    blobs: rewritten,
    renameMap,
    renamedCount: Object.keys(renameMap).length,
  }
}
