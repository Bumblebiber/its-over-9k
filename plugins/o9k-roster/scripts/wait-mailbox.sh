#!/usr/bin/env bash
# wait-mailbox.sh — block until mailbox reaches a parent-wake status, or ceiling.
# Usage: wait-mailbox.sh <mailbox-dir> [--ceiling-sec N]
# Exit: 0 = terminal/question status; 2 = ceiling; 1 = usage error
#
# IMPORTANT: do NOT exit on the first filesystem event. Workers touch HEARTBEAT
# and rewrite STATUS=watching on start — that must not wake the parent as "done".
# Live bug 2026-07-20: watcher returned watching in seconds after HEARTBEAT.
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

is_wake() {
  local st
  st="$(tr -d '[:space:]' <"$MB/STATUS" 2>/dev/null || true)"
  case "$st" in
    done|failed|cancelled|waiting_human) return 0 ;;
    *) return 1 ;;
  esac
}

# Already terminal/question before we wait.
if is_wake; then exit 0; fi

deadline=$((SECONDS + CEILING))

if command -v inotifywait >/dev/null 2>&1; then
  while (( SECONDS < deadline )); do
    remaining=$((deadline - SECONDS))
    (( remaining < 1 )) && break
    # inotifywait -t is seconds; exit 2 on timeout
    if inotifywait -e create,close_write,moved_to,modify -t "$remaining" --format '%w%f' "$MB" >/tmp/o9k-wait-mailbox.$$.out 2>/dev/null; then
      rm -f /tmp/o9k-wait-mailbox.$$.out
      if is_wake; then exit 0; fi
      # HEARTBEAT / non-terminal STATUS change — keep waiting
      continue
    else
      ec=$?
      rm -f /tmp/o9k-wait-mailbox.$$.out
      if [[ "$ec" -eq 2 ]]; then exit 2; fi
      # spurious error — brief backoff then retry if time left
      sleep 1
    fi
  done
  # Final check after loop
  if is_wake; then exit 0; fi
  exit 2
fi

# Fallback: sleep loop in ONE process (still one tool invocation from the agent)
interval=5
if (( CEILING < 5 )); then interval=1; fi
while (( SECONDS < deadline )); do
  if is_wake; then exit 0; fi
  sleep "$interval"
done
if is_wake; then exit 0; fi
exit 2
