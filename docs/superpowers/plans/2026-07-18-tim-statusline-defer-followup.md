# TIM follow-up: defer statusline auto-wire when o9k present

Out of scope for o9k coexistence PR. Implement in `~/projects/tim`:

1. In `setup-agent` / Hermes statusline install: if `~/.o9k` exists OR
   o9k marketplace/plugin detected → skip auto-wire; print
   "Use /o9k-init statusline (element tim)".
2. Keep `tim statusline` + `tim setup-hermes-statusline` for TIM-only.
3. Changelog entry in TIM.
