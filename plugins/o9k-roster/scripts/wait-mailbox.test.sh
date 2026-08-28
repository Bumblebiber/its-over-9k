#!/usr/bin/env bash
# wait-mailbox.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/mailbox"
# background writer
( sleep 1; echo hi > "$TMP/mailbox/STATUS" ) &
set +e
"$ROOT/wait-mailbox.sh" "$TMP/mailbox" --ceiling-sec 10
ec=$?
set -e
[[ "$ec" -eq 0 ]] || { echo "expected exit 0 got $ec"; exit 1; }
# ceiling — fresh empty dir so no events occur
mkdir -p "$TMP/empty"
set +e
"$ROOT/wait-mailbox.sh" "$TMP/empty" --ceiling-sec 2
ec=$?
set -e
[[ "$ec" -eq 2 ]] || { echo "expected exit 2 got $ec"; exit 1; }
echo "wait-mailbox.test.sh OK"
