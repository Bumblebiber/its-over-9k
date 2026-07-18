#!/usr/bin/env bash
# Template — wire-hermes.mjs bakes an absolute O9K_MARKETPLACE_ROOT into the
# copy it installs at ~/.hermes/agent-hooks/hermes-o9k-statusline.sh. Do not
# rely on an environment variable here: Hermes's cli.py invokes this script
# via `subprocess.run(["bash", script], ...)` with no env passthrough
# guarantee, so the root must be baked in at install time.
set -euo pipefail
ROOT="__O9K_MARKETPLACE_ROOT__"
exec node "$ROOT/o9k-core/scripts/statusline/o9k-statusline.mjs" --host hermes --format hermes
