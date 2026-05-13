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
