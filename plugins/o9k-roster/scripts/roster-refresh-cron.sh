#!/usr/bin/env bash
# roster-refresh-cron.sh — weekly matrix refresh (disk-first report).
# Contract for Overseer/Hermes cron: run this script; do not inline collectors.
# Prefer ~/.hermes/scripts/roster-refresh-wrapper.sh from hermes cron (loads API key).
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

STATUS=0
{
  echo "# roster-refresh $STAMP"
  echo
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    echo "FAILED: OPENROUTER_API_KEY not set"
    STATUS=1
  elif [[ ! -f "${O9K_ROSTER:-$HOME/.o9k/roster.json}" ]]; then
    echo "SKIP: no roster.json yet — run roster.mjs init and curate first"
    STATUS=0
  else
    node "$ROSTER_JS" refresh --apply || STATUS=$?
  fi
  echo
  echo "_exit code: ${STATUS}_"
} 2>&1 | tee "$REPORT"

echo "report: $REPORT"
exit "$STATUS"
