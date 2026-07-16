#!/usr/bin/env bash
# usage: check.sh <worktree>
set -euo pipefail
A="$1/ANSWER.md"
[ -f "$A" ] || exit 1
grep -q "detect.mjs" "$A" || exit 1
grep -q "session-start.mjs" "$A" || exit 1
exit 0
