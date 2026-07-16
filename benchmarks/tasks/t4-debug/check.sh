#!/usr/bin/env bash
# usage: check.sh <worktree>
set -euo pipefail
cd "$1"
# test file untouched
cmp -s bench-fixture/slugify.test.mjs "$BENCH_TASK_DIR/fixtures/slugify.test.mjs" || exit 1
node bench-fixture/slugify.test.mjs | grep -q "^ok$" || exit 1
exit 0
