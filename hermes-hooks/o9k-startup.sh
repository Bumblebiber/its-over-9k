#!/usr/bin/env bash
# o9k-startup.sh — Hermes pre_llm_call hook
# Session-Start: injiziert Memory-Kontext (Projekt-Hinweis, hmem-sync Status)
# Checkpoint-Reminder: alle N Turns (N = checkpointInterval aus hmem.config.json, default 20)
#
# Requires: jq, hmem (global npm)

set -euo pipefail

# Env defaults
export HMEM_PATH="${HMEM_PATH:-/home/bbbee/.hmem/Agents/DEVELOPER/DEVELOPER.hmem}"
export HMEM_PROJECT_DIR="${HMEM_PROJECT_DIR:-/home/bbbee/.hmem/Agents/DEVELOPER}"

# Lese Hook-Payload
payload="$(cat -)"

session_id=$(echo "$payload" | jq -r '.session_id // "unknown"')
is_first=$(echo "$payload" | jq -r '.extra.is_first_turn // false')
platform=$(echo "$payload" | jq -r '.extra.platform // "cli"')

# --- First turn: Memory-Context-Injection ---
if [[ "$is_first" == "true" ]]; then
    # Checkpoint-Interval aus Config lesen (default 20)
    checkpoint_interval=20
    hmem_config="${HMEM_PROJECT_DIR}/hmem.config.json"
    if [[ -f "$hmem_config" ]]; then
        interval_from_config=$(jq -r '.memory.checkpointInterval // empty' "$hmem_config" 2>/dev/null)
        if [[ -n "$interval_from_config" && "$interval_from_config" -gt 0 ]]; then
            checkpoint_interval="$interval_from_config"
        fi
    fi

    # Sync-Status prüfen
    sync_status=""
    if command -v hmem &>/dev/null; then
        sync_status=$(hmem sync status 2>/dev/null || echo "")
    fi

    # Projekte auflisten (letzte 5)
    projects=""
    if [[ -f "$HMEM_PATH" ]]; then
        projects=$(sqlite3 "$HMEM_PATH" \
            "SELECT id || ' ' || title FROM memories WHERE prefix='P' AND irrelevant=0 AND obsolete=0 ORDER BY updated_at DESC LIMIT 5" \
            2>/dev/null || echo "")
    fi

    # Sync-Indikator
    sync_dot=""
    if echo "$sync_status" | grep -q "Online: yes"; then
        sync_dot="🟢"
    else
        sync_dot="🔴"
    fi

    # Context bauen
    context=""
    context+="${sync_dot} hmem "
    if echo "$sync_status" | grep -q "Online: yes"; then
        context+="Sync verbunden"
    else
        context+="Sync offline"
    fi
    context+="\n$(echo "$sync_status" | grep "Last sync" || true)\n"
    context+="💾 Nutze load_project(id='P00XX') um ein Projekt zu aktivieren.\n"
    if [[ -n "$projects" ]]; then
        context+="Letzte Projekte:\n"
        while IFS= read -r line; do
            context+="  $line\n"
        done <<< "$projects"
    fi

    # Session-ID für Statusline cachen
    cache_dir="${HMEM_PROJECT_DIR}"
    mkdir -p "$cache_dir"
    echo "{\"session_id\":\"$session_id\"}" > "${cache_dir}/.session-cache"

    jq -n --arg ctx "$context" '{context: $ctx}'
    exit 0
fi

# --- Checkpoint-Reminder (nach N Turns) ---
counter_file="/tmp/hermes-o9k-counter-${session_id}"

# Turn zählen
turn_count=1
if [[ -f "$counter_file" ]]; then
    turn_count=$(($(cat "$counter_file") + 1))
fi
echo "$turn_count" > "$counter_file"

# Checkpoint-Interval aus Config
checkpoint_interval=20
hmem_config="${HMEM_PROJECT_DIR}/hmem.config.json"
if [[ -f "$hmem_config" ]]; then
    interval_from_config=$(jq -r '.memory.checkpointInterval // empty' "$hmem_config" 2>/dev/null)
    if [[ -n "$interval_from_config" && "$interval_from_config" -gt 0 ]]; then
        checkpoint_interval="$interval_from_config"
    fi
fi

# Reminder ausgeben wenn fällig
if (( turn_count % checkpoint_interval == 0 )); then
    reminder="📝 Checkpoint fällig (Turn $turn_count). Wichtige Erkenntnisse mit write_memory speichern."
    jq -n --arg ctx "$reminder" '{context: $ctx}'
else
    printf '{}\n'
fi

exit 0
