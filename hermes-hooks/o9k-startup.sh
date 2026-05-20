#!/usr/bin/env bash
# o9k-startup.sh — Hermes pre_llm_call hook
# Session-Start: minimal — sync + inject o9k-session-start skill directive.
# All heavy lifting (H-entries, projects, pinned expansion, greeting) is in the skill.
# Checkpoint reminders + long-session warnings on subsequent turns.
#
# Requires: jq, hmem (global npm)

set -euo pipefail

export HMEM_PATH="${HMEM_PATH:-/home/bbbee/.hmem/Agents/DEVELOPER/DEVELOPER.hmem}"
export HMEM_PROJECT_DIR="${HMEM_PROJECT_DIR:-/home/bbbee/.hmem/Agents/DEVELOPER}"

payload="$(cat -)"

session_id=$(echo "$payload" | jq -r '.session_id // "unknown"')
is_first=$(echo "$payload" | jq -r '.extra.is_first_turn // false')
platform=$(echo "$payload" | jq -r '.extra.platform // "cli"')
parent_uuid=$(echo "$payload" | jq -r '.parentUuid // empty')

# --- Subagent: silent pass-through ---
if [[ -n "$parent_uuid" ]]; then
    printf '{}\n'
    exit 0
fi

# --- Session ID cache for statusline ---
cache_dir="${HMEM_PROJECT_DIR}"
mkdir -p "$cache_dir"
echo "{\"session_id\":\"$session_id\"}" > "${cache_dir}/.session-cache"

# ============================================================
# FIRST TURN: minimal bootstrap — sync + skill directive
# ============================================================
if [[ "$is_first" == "true" ]]; then
    # Sync-Pull (3s timeout, silent)
    if command -v hmem &>/dev/null; then
        timeout 3 hmem sync pull </dev/null >/dev/null 2>/dev/null || true
    fi

    # Sync-Status
    sync_block=""
    if command -v hmem &>/dev/null; then
        config_file="$HOME/.hmem/config.json"
        if [[ ! -f "$config_file" ]]; then
            sync_block="--- hmem-sync ---\n✗ Not configured"
        else
            server=$(jq -r '.server // "unknown"' "$config_file" 2>/dev/null)
            linked=$(jq -r 'if .session_token or .api_key then "yes" else "" end' "$config_file" 2>/dev/null)
            active_file=$(jq -r '.active_file // ""' "$config_file" 2>/dev/null)
            sync_status_raw=$(HMEM_PATH="$HMEM_PATH" timeout 3 hmem sync status </dev/null 2>/dev/null || echo "")
            last_sync=$(echo "$sync_status_raw" | grep "Last sync" | sed 's/Last sync: *//' || echo "")
            if [[ -z "$linked" ]]; then
                sync_block="--- hmem-sync ---\n✗ Not linked"
            elif [[ -z "$active_file" ]]; then
                sync_block="--- hmem-sync ---\n⚠ Authenticated, no active file"
            elif [[ -z "$last_sync" ]]; then
                sync_block="--- hmem-sync ---\n⚠ Linked (${active_file}), never synced"
            else
                sync_block="--- hmem-sync ---\n✓ Linked to ${server} | active_file: ${active_file} | last sync: ${last_sync}"
            fi
        fi
    fi

    # Minimal directive — skill handles everything else
    directive="IMPORTANT: This is the first message of a new session.\n\nYou are a Hermes AI Agent with hmem long-term memory. Load the o9k-session-start skill (skill_view(name='o9k-session-start')) and follow its instructions. The skill handles: project activation, pending git work, Next Steps, greeting, and O-entry routing — do not skip any step.\n\n${sync_block}"

    jq -n --arg ctx "$directive" '{context: $ctx}'
    exit 0
fi

# ============================================================
# SUBSEQUENT TURNS: checkpoint reminders + long-session warnings
# ============================================================
counter_file="/tmp/hermes-o9k-counter-${session_id}"

turn_count=1
if [[ -f "$counter_file" ]]; then
    turn_count=$(($(cat "$counter_file") + 1))
fi
echo "$turn_count" > "$counter_file"

# Config lesen
checkpoint_interval=20
hmem_config="${HMEM_PROJECT_DIR}/hmem.config.json"
if [[ -f "$hmem_config" ]]; then
    interval_from_config=$(jq -r '.memory.checkpointInterval // empty' "$hmem_config" 2>/dev/null)
    if [[ -n "$interval_from_config" && "$interval_from_config" -gt 0 ]]; then
        checkpoint_interval="$interval_from_config"
    fi
fi

# Checkpoint Reminder
if [[ $(( turn_count % checkpoint_interval )) -eq 0 ]]; then
    reminder="📝 Checkpoint fällig (Turn $turn_count). Wichtige Erkenntnisse mit write_memory speichern."
    jq -n --arg ctx "$reminder" '{context: $ctx}'

# Long-Session Warning (ab 60 Turns, alle 5)
elif [[ "$turn_count" -ge 60 && $(( turn_count % 5 )) -eq 0 ]]; then
    warning="⚠️ Lange Session (Turn $turn_count). /wipe zum Speichern, dann /clear für frischen Kontext."
    jq -n --arg ctx "$warning" '{context: $ctx}'

else
    printf '{}\n'
fi

exit 0
