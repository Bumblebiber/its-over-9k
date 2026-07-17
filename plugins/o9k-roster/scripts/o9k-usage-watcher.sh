#!/usr/bin/env bash
# o9k-usage-watcher.sh — systemd/cron entrypoint (never exec .mjs without node).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"
if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  echo "o9k-usage-watcher: node not found (set NODE_BIN)" >&2
  exit 127
fi
exec "$NODE" "$ROOT/usage-watcher.mjs" "$@"
