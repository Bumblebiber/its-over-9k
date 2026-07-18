#!/usr/bin/env bash
# roster-refresh-cron.sh — weekly matrix refresh (disk-first report).
# Cron contract: run this script; do not inline collectors. Needs
# OPENROUTER_API_KEY in the cron environment (wrapper script or env file).
#
# Optional env:
#   O9K_REPORT_DIR   base dir for reports (default ~/.o9k/reports)
#   O9K_NOTIFY_CMD   command invoked as: $O9K_NOTIFY_CMD <report-path>
#                    after each run (e.g. a script that mails/pings you)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROSTER_JS="$ROOT/scripts/roster.mjs"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

OUT_DIR="${O9K_REPORT_DIR:-$HOME/.o9k/reports}/roster-refresh"
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

# Optional notification hook (full report stays on disk).
if [[ -n "${O9K_NOTIFY_CMD:-}" ]]; then
  "$O9K_NOTIFY_CMD" "$REPORT" || echo "WARN: O9K_NOTIFY_CMD failed" >&2
fi

exit "$STATUS"
