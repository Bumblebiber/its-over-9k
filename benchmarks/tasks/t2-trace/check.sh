#!/usr/bin/env bash
# usage: check.sh <worktree>
set -euo pipefail
A="$1/ANSWER.md"
[ -f "$A" ] || exit 1
# ground truth: recompute from the worktree itself
expected=$(grep -rl "COMBINING.md" "$1/plugins" --include=SKILL.md | sed "s|^$1/||" | sort)
[ -n "$expected" ] || exit 1
while IFS= read -r p; do
  grep -qF "$p" "$A" || exit 1
done <<< "$expected"
exit 0
