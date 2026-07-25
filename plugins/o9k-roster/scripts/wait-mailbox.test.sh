#!/usr/bin/env bash
# wait-mailbox.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/mailbox"
echo watching > "$TMP/mailbox/STATUS"

# HEARTBEAT must NOT wake the waiter (regression 2026-07-20)
(
  sleep 1
  date -u +%Y-%m-%dT%H:%M:%SZ > "$TMP/mailbox/HEARTBEAT"
  sleep 1
  echo done > "$TMP/mailbox/STATUS"
) &
set +e
"$ROOT/wait-mailbox.sh" "$TMP/mailbox" --ceiling-sec 10
ec=$?
set -e
[[ "$ec" -eq 0 ]] || { echo "expected exit 0 got $ec"; exit 1; }

# ceiling — STATUS stays watching
mkdir -p "$TMP/stuck"
echo watching > "$TMP/stuck/STATUS"
set +e
"$ROOT/wait-mailbox.sh" "$TMP/stuck" --ceiling-sec 2
ec=$?
set -e
[[ "$ec" -eq 2 ]] || { echo "expected exit 2 got $ec"; exit 1; }

# already done → immediate 0
mkdir -p "$TMP/ready"
echo done > "$TMP/ready/STATUS"
set +e
"$ROOT/wait-mailbox.sh" "$TMP/ready" --ceiling-sec 5
ec=$?
set -e
[[ "$ec" -eq 0 ]] || { echo "expected immediate 0 got $ec"; exit 1; }

echo "wait-mailbox.test.sh OK"
