#!/usr/bin/env bash
# Hermes has no pre-compact hook event — wrapper installed for parity but not wired in config.yaml.
# See wireHermes detail: precompact: unsupported (no Hermes compact hook; use on_session_end for cleanup only).
set -euo pipefail
ROOT="${O9K_MARKETPLACE_ROOT:?O9K_MARKETPLACE_ROOT required}"
RUNNER="$ROOT/o9k-core/hooks/adapters/run-o9k-hook.sh"
exec bash "$RUNNER" memory/pre-compact
