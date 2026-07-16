#!/usr/bin/env bash
# roster-refresh-cron.sh — weekly matrix refresh (disk-first report).
# Contract for Overseer/Hermes cron: run this script; do not inline collectors.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROSTER_JS="$ROOT/scripts/roster.mjs"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -d "${HOME}/.hermes/cron-outputs" ]]; then
  OUT_DIR="${HOME}/.hermes/cron-outputs/roster-refresh"
else
  OUT_DIR="${HOME}/.o9k/reports/roster-refresh"
fi
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/report-$STAMP.md"

{
  echo "# roster-refresh $STAMP"
  echo
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    echo "FAILED: OPENROUTER_API_KEY not set"
    exit 1
  fi
  node "$ROSTER_JS" refresh --apply
} 2>&1 | tee "$REPORT"

echo "report: $REPORT"
