#!/usr/bin/env bash
#
# o9k-companions.sh — one-command installer for a conflict-free companion stack.
#
# Bundles are curated to be INTERNALLY CONFLICT-FREE: no two tools in a bundle
# claim the same o9k concern (see docs/COMBINING.md). This is the whole point of
# o9k — the pieces multiply instead of colliding.
#
# Usage:
#   install/o9k-companions.sh <bundle> [--run]
#
#   <bundle>   minimal | recommended | max   (default: recommended)
#   --run      actually execute the shell-installable steps.
#              Without it, this is a DRY RUN: it only prints the plan.
#
# Some companions install inside a Claude Code session (/plugin ...) and cannot
# be run from a shell — those are always printed as manual steps, never executed.

set -euo pipefail

BUNDLE="${1:-recommended}"
RUN="no"
for arg in "$@"; do [ "$arg" = "--run" ] && RUN="yes"; done

say()  { printf '%s\n' "$*"; }
banner() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

# have <cmd> — is a prerequisite on PATH?
have() { command -v "$1" >/dev/null 2>&1; }

# step "<label>" "<shell command>" — runnable step (executed only with --run)
step() {
  local label="$1" cmd="$2"
  say "  • $label"
  say "      \$ $cmd"
  if [ "$RUN" = "yes" ]; then
    if eval "$cmd"; then say "      ✓ done"; else say "      ✗ FAILED (continuing)"; fi
  fi
}

# manual "<label>" "<instruction>" — cannot be shell-run; always just printed
manual() {
  say "  • $1"
  say "      → $2"
}

case "$BUNDLE" in
  minimal|recommended|max) ;;
  *) say "unknown bundle '$BUNDLE' (use: minimal | recommended | max)"; exit 2 ;;
esac

say "o9k companion installer — bundle: $BUNDLE  (mode: $([ "$RUN" = yes ] && echo EXECUTE || echo DRY-RUN))"
[ "$RUN" = "yes" ] || say "This is a dry run. Re-run with --run to execute the shell steps."

# --- prerequisite check -----------------------------------------------------
banner "Prerequisites"
for tool in node npm; do
  have "$tool" && say "  ✓ $tool" || say "  ✗ $tool  (required — install it first)"
done
have git   && say "  ✓ git"                 || say "  · git not found — strongly recommended for any dev machine (/o9k-init offers to install it)"
have uvx   && say "  ✓ uvx (Serena)"        || say "  · uvx not found — needed only for Serena (pip install uv)"
have claude && say "  ✓ claude CLI (MCP add)" || say "  · claude CLI not found — needed to register MCP servers"

# --- MINIMAL: memory + live docs (zero-conflict foundation) ------------------
banner "Memory backend  (concern: memory — ONE owner only)"
step   "hmem — available default memory MCP" \
       "npm install -g hmem-mcp && hmem init"
say    "      (TIM is planned/unreleased; o9k-memory auto-prefers it once it ships.)"

banner "Live library docs  (concern: none — orthogonal, pure add)"
step   "Context7 — up-to-date docs injection" \
       "claude mcp add context7 -- npx -y @upstash/context7-mcp"

banner "Code minimalism  (concern: code volume — composes with caveman)"
manual "Ponytail (DietrichGebert) — the lazy senior dev, ~54% less code" \
       "in a Claude Code session: /plugin marketplace add DietrichGebert/ponytail && /plugin install ponytail  (see https://ponytail.dev)"
say    "      caveman owns prose tone; Ponytail owns the code decision. Zero-conflict multiplier."

if [ "$BUNDLE" = "minimal" ]; then
  banner "Done (minimal)"
  say  "Next: /plugin install o9k-core@o9k and the other pillars if you haven't."
  exit 0
fi

# --- RECOMMENDED: + methodology + task graph + symbols ----------------------
banner "Workflow methodology  (concern: methodology — ONE spine)"
manual "superpowers (obra) — brainstorm→plan→TDD→review" \
       "in a Claude Code session: /plugin marketplace add obra/superpowers && /plugin install superpowers"
say    "      o9k-dispatch owns subagent isolation; disable superpowers' dispatching-parallel-agents if still enabled."

banner "Task / plan graph  (concern: plan — ONE owner)"
manual "beads (steveyegge) — dependency-aware issue graph" \
       "install the 'bd' CLI + MCP per https://github.com/steveyegge/beads (Go binary / install script)"
say    "      beads owns work items; memory owns lessons/decisions. Don't cross the streams."

banner "Symbol-level navigation  (concern: symbols — big repos)"
if have uvx; then
  step "Serena (oraios) — LSP symbol ops MCP" \
       "claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server"
else
  manual "Serena (oraios) — LSP symbol ops MCP" \
       "install uv first (pip install uv), then: claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server"
fi
say    "      Scout owns the overview map; Serena owns symbols. Never both per lookup."

if [ "$BUNDLE" = "recommended" ]; then
  banner "Done (recommended)"
  say  "Dispatch owner: o9k-dispatch (disable superpowers dispatching-parallel-agents if still on)."
  exit 0
fi

# --- MAX: + structural queries + cost reporting -----------------------------
banner "Structural queries  (concern: feeds scout — no overview conflict)"
step   "ast-grep — structural code search" \
       "npm install -g @ast-grep/cli"

banner "Cost / usage reporting  (concern: none — complements /o9k-stats)"
step   "ccusage — token & \$ reports from Claude Code logs" \
       "npm install -g ccusage"

banner "Done (max)"
say  "Conflict-free by construction. o9k-dispatch owns dispatch;"
say  "disable superpowers dispatching-parallel-agents if still enabled. See docs/COMBINING.md."
