#!/usr/bin/env bash
# usage: check.sh <worktree>
set -euo pipefail
A="$1/ANSWER.md"
[ -f "$A" ] || exit 1
grep -qi "registry" "$A" || exit 1
grep -qi "concern" "$A" || exit 1
grep -qi "bundle" "$A" || exit 1
# rough length cap: 10 sentences won't exceed ~2500 chars
[ "$(wc -c < "$A")" -le 4000 ] || exit 1
exit 0
