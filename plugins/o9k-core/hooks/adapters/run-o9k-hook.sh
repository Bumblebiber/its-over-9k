#!/usr/bin/env bash
# Usage: run-o9k-hook.sh <core|memory>/<script-basename>
# Resolves O9K_MARKETPLACE_ROOT or walks from this file to plugins/.
set -euo pipefail
TARGET="${1:?target like core/session-start}"
ROOT="${O9K_MARKETPLACE_ROOT:-}"
if [[ -z "$ROOT" ]]; then
  ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"  # hooks/adapters -> o9k-core -> plugins
fi
case "$TARGET" in
  core/*)  SCRIPT="$ROOT/o9k-core/scripts/${TARGET#core/}.mjs"
           export CLAUDE_PLUGIN_ROOT="$ROOT/o9k-core" ;;
  memory/*) SCRIPT="$ROOT/o9k-memory/scripts/${TARGET#memory/}.mjs"
           export CLAUDE_PLUGIN_ROOT="$ROOT/o9k-memory" ;;
  *) echo "unknown target $TARGET" >&2; exit 1 ;;
esac
exec node "$SCRIPT"
