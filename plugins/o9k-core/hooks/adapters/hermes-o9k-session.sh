#!/usr/bin/env bash
# Reference-only: example Hermes pre_llm_call session-start stack (core + memory + update-check).
# wire-hermes.mjs installs per-hook wrappers at ~/.hermes/agent-hooks/o9k-*.sh instead.
set -euo pipefail
ROOT="${O9K_MARKETPLACE_ROOT:?O9K_MARKETPLACE_ROOT required}"
RUNNER="$ROOT/o9k-core/hooks/adapters/run-o9k-hook.sh"
bash "$RUNNER" core/session-start
bash "$RUNNER" memory/session-start
bash "$RUNNER" core/update-check
