#!/usr/bin/env bash
# usage-collect-cron.sh — daily safety net when usage-watcher is stale/dead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COLLECT_JS="$ROOT/scripts/usage-collect.mjs"
WATCHER_STATE="${O9K_USAGE_WATCHER_STATE:-$HOME/.o9k/usage-watcher.json}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -d "${HOME}/.hermes/cron-outputs" ]]; then
  OUT_DIR="${HOME}/.hermes/cron-outputs/usage-collector"
else
  OUT_DIR="${HOME}/.o9k/reports/usage-collector"
fi
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/report-$STAMP.md"

STATUS=0
{
  echo "# usage-collector $STAMP"
  echo
  if [[ ! -f "${O9K_ROSTER:-$HOME/.o9k/roster.json}" ]]; then
    echo "SKIP: no roster.json"
  elif [[ -f "$WATCHER_STATE" ]]; then
    mtime=$(stat -c %Y "$WATCHER_STATE" 2>/dev/null || stat -f %m "$WATCHER_STATE")
    now=$(date +%s)
    age=$((now - mtime))
    if (( age < 90000 )); then
      echo "SKIP: watcher state fresh (${age}s old)"
    else
      node "$COLLECT_JS" --all || STATUS=$?
    fi
  else
    node "$COLLECT_JS" --all || STATUS=$?
  fi
  echo
  echo "_exit code: ${STATUS}_"
} 2>&1 | tee "$REPORT"

echo "report: $REPORT"
exit "$STATUS"
