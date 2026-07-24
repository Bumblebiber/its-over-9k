#!/usr/bin/env bash
# o9k bundle-bench runner.
#
# Runs every task in tasks/ against a fresh clone of the pinned target,
# with Claude Code pointed at a SANDBOX config dir (the combo under test),
# and writes a result JSON to results/.
#
# usage: run-bench.sh <combo-name> <sandbox-config-dir> [model] [--repeat N]
#                     [--sandbox-note "..."]
#
#   combo-name          label for the combo under test, e.g. "bare",
#                       "o9k-pillars", "o9k+serena+hmem"
#   sandbox-config-dir  CLAUDE_CONFIG_DIR with exactly that combo installed
#                       (never your live ~/.claude — see the bundle-bench skill)
#   model               claude model alias (default: sonnet)
#   --repeat N          run every task N times (default 1). LLM runs are noisy;
#                       quote comparative numbers only from repeated runs —
#                       the summary then carries per-task pass_rate and
#                       cost mean/min/max.
#   --sandbox-note S    free-text description of what is installed in the
#                       sandbox (plugins + MCP servers with versions). A combo
#                       label alone is not reproducible; the auto-captured
#                       inventory below is best-effort, this is the record.
#
# Requires: claude, jq, git, node. Costs real API/plan tokens (× N).
set -euo pipefail

COMBO="${1:?combo name required}"
SANDBOX="${2:?sandbox config dir required}"
shift 2
MODEL="sonnet"
REPEAT=1
SANDBOX_NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repeat) REPEAT="${2:?--repeat needs a number}"; shift 2 ;;
    --sandbox-note) SANDBOX_NOTE="${2:?--sandbox-note needs a string}"; shift 2 ;;
    *) MODEL="$1"; shift ;;
  esac
done
case "$REPEAT" in (''|*[!0-9]*|0) echo "--repeat must be a positive integer" >&2; exit 1 ;; esac

BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$BENCH_DIR/tasks/MANIFEST.json"
TARGET_REPO="$(jq -r .target_repo "$MANIFEST")"
TARGET_REF="$(jq -r .target_ref "$MANIFEST")"

case "$(readlink -f "$SANDBOX")" in
  "$(readlink -f "$HOME/.claude")") echo "refusing to run against the live ~/.claude" >&2; exit 1 ;;
esac

# Sandbox inventory. SCHEMA.md requires the combo's exact contents to be
# stated, but "state it in the PR body" is a promise nobody keeps — the
# committed o9k-full result has no record of what was in it. Capture what is
# provable from the sandbox config itself (no `claude` subprocess: some of
# those commands dial out to MCP servers and can hang a benchmark run).
sandbox_inventory() {
  local settings="$SANDBOX/settings.json"
  local plugins="null" mcp="null"
  [ -f "$settings" ] && plugins="$(jq -c '.enabledPlugins // null' "$settings" 2>/dev/null || echo null)"
  [ -f "$settings" ] && mcp="$(jq -c '.mcpServers // null | if . then keys else null end' "$settings" 2>/dev/null || echo null)"
  jq -n --argjson p "$plugins" --argjson m "$mcp" --arg note "$SANDBOX_NOTE" \
    '{enabled_plugins: $p, mcp_servers: $m, note: (if $note == "" then null else $note end)}'
}
SANDBOX_JSON="$(sandbox_inventory)"
if [ "$SANDBOX_NOTE" = "" ]; then
  echo "warning: no --sandbox-note given; the result will not be fully reproducible" >&2
fi

TASKS_HASH="$(cd "$BENCH_DIR/tasks" && find . -type f | sort | xargs cat | sha256sum | cut -c1-12)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/o9k-bench-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "combo=$COMBO model=$MODEL repeat=$REPEAT tasks_hash=$TASKS_HASH target=$TARGET_REF"
git clone --quiet --branch "$TARGET_REF" --depth 1 "$TARGET_REPO" "$WORK/base"

RESULTS="[]"
for rep in $(seq 1 "$REPEAT"); do
for task_dir in "$BENCH_DIR"/tasks/t*/; do
  task="$(basename "$task_dir")"
  tree="$WORK/$task-r$rep"
  cp -r "$WORK/base" "$tree"
  if [ -d "$task_dir/fixtures" ]; then
    mkdir -p "$tree/bench-fixture"
    cp "$task_dir/fixtures/"* "$tree/bench-fixture/"
  fi

  echo "── $task (run $rep/$REPEAT)"
  set +e
  out="$(cd "$tree" && CLAUDE_CONFIG_DIR="$SANDBOX" claude -p "$(cat "$task_dir/prompt.md")" \
    --model "$MODEL" --output-format json --max-turns 40 --permission-mode acceptEdits 2>"$WORK/$task-r$rep.err")"
  claude_rc=$?
  set -e

  if [ $claude_rc -ne 0 ] || [ -z "$out" ]; then
    echo "   claude run failed (rc=$claude_rc), see $WORK/$task-r$rep.err"
    row="$(jq -n --arg t "$task" --argjson rep "$rep" '{task:$t, rep:$rep, pass:false, error:"claude_run_failed"}')"
  else
    set +e
    BENCH_TASK_DIR="$task_dir" bash "$task_dir/check.sh" "$tree" >/dev/null 2>&1
    pass=$([ $? -eq 0 ] && echo true || echo false)
    set -e
    row="$(printf '%s' "$out" | jq --arg t "$task" --argjson rep "$rep" --argjson p "$pass" '{
      task: $t, rep: $rep, pass: $p,
      turns: .num_turns, duration_ms: .duration_ms, cost_usd: .total_cost_usd,
      input_tokens: (.usage.input_tokens // 0),
      output_tokens: (.usage.output_tokens // 0),
      cache_read_tokens: (.usage.cache_read_input_tokens // 0),
      cache_creation_tokens: (.usage.cache_creation_input_tokens // 0)
    }')"
    echo "   pass=$pass cost=$(printf '%s' "$row" | jq -r .cost_usd)"
  fi
  RESULTS="$(printf '%s' "$RESULTS" | jq --argjson r "$row" '. + [$r]')"
done
done

OUT_FILE="$BENCH_DIR/results/${COMBO}-${MODEL}-$(date +%F).json"
jq -n \
  --arg combo "$COMBO" --arg model "$MODEL" --arg hash "$TASKS_HASH" \
  --arg ref "$TARGET_REF" --arg date "$(date -u +%FT%TZ)" \
  --arg cc "$(claude --version 2>/dev/null | head -1)" \
  --argjson repeats "$REPEAT" \
  --argjson sandbox "$SANDBOX_JSON" \
  --argjson tasks "$RESULTS" '{
    combo: $combo, model: $model, tasks_hash: $hash, target_ref: $ref,
    date: $date, claude_code: $cc, repeats: $repeats,
    sandbox: $sandbox,
    passed: ([$tasks[] | select(.pass)] | length),
    total: ($tasks | length),
    total_cost_usd: ([$tasks[].cost_usd // 0] | add),
    total_output_tokens: ([$tasks[].output_tokens // 0] | add),
    # Cache tokens are ~85% of the bill (see docs/EVIDENCE.md); a summary
    # that reports only output tokens hides where the money actually goes.
    total_cache_read_tokens: ([$tasks[].cache_read_tokens // 0] | add),
    total_cache_creation_tokens: ([$tasks[].cache_creation_tokens // 0] | add),
    total_turns: ([$tasks[].turns // 0] | add),
    task_summary: ($tasks | group_by(.task) | map({
      task: .[0].task,
      runs: length,
      pass_rate: (([.[] | select(.pass)] | length) / length),
      cost_mean: (([.[].cost_usd // 0] | add) / length),
      cost_min: ([.[].cost_usd // 0] | min),
      cost_max: ([.[].cost_usd // 0] | max),
      turns_mean: (([.[].turns // 0] | add) / length),
      output_tokens_mean: (([.[].output_tokens // 0] | add) / length)
    })),
    tasks: $tasks
  }' > "$OUT_FILE"

echo "→ $OUT_FILE"
jq '{combo, passed, total, total_cost_usd}' "$OUT_FILE"
