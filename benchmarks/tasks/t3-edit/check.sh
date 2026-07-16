#!/usr/bin/env bash
# usage: check.sh <worktree>
set -euo pipefail
R="$1/plugins/o9k-core/compat/registry.json"
jq -e '.concerns.telemetry.exclusive == false and .concerns.telemetry.desc == "usage telemetry"' "$R" > /dev/null || exit 1
# nothing else changed
cd "$1"
[ "$(git status --porcelain | wc -l)" -eq 1 ] || exit 1
git status --porcelain | grep -q "plugins/o9k-core/compat/registry.json" || exit 1
exit 0
