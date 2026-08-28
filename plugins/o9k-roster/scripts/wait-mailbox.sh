#!/usr/bin/env bash
# wait-mailbox.sh — block until mailbox changes or ceiling.
# Usage: wait-mailbox.sh <mailbox-dir> [--ceiling-sec N]
# Exit: 0 = filesystem event or file appeared; 2 = ceiling; 1 = usage error
set -euo pipefail
MB="${1:-}"
shift || true
CEILING=3600
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ceiling-sec) CEILING="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$MB" && -d "$MB" ]] || { echo "usage: wait-mailbox.sh <mailbox-dir> [--ceiling-sec N]" >&2; exit 1; }

if command -v inotifywait >/dev/null 2>&1; then
  # -t is seconds; exit 2 on timeout (inotify-tools)
  if inotifywait -e create,close_write,moved_to,modify -t "$CEILING" --format '%w%f' "$MB" >/tmp/o9k-wait-mailbox.$$.out 2>/dev/null; then
    rm -f /tmp/o9k-wait-mailbox.$$.out
    exit 0
  else
    ec=$?
    rm -f /tmp/o9k-wait-mailbox.$$.out
    # inotifywait returns 2 on timeout
    if [[ "$ec" -eq 2 ]]; then exit 2; fi
    exit "$ec"
  fi
fi

# Fallback: sleep loop in ONE process (still one tool invocation from the agent)
interval=5
if (( CEILING < 5 )); then interval=1; fi
deadline=$((SECONDS + CEILING))
# -printf is GNU-only; BSD find (macOS) needs stat -f. Probe once, not per poll.
if find "$MB" -maxdepth 0 -printf '' >/dev/null 2>&1; then
  snapshot() { find "$MB" -type f -printf '%p %T@ %s\n' 2>/dev/null | sort; }
else
  snapshot() { find "$MB" -type f -exec stat -f '%N %m %z' {} + 2>/dev/null | sort; }
fi
prev="$(snapshot || true)"
while (( SECONDS < deadline )); do
  sleep "$interval"
  cur="$(snapshot || true)"
  if [[ "$cur" != "$prev" ]]; then
    exit 0
  fi
done
exit 2
