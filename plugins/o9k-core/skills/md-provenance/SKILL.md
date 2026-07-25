---
name: md-provenance
description: "Provenance stamps for Markdown writes. Use whenever creating or editing a .md file (HANDOFF, PLAN, RESULT, notes, docs) — before the Write/Edit, record why/trigger in ~/.o9k/md-provenance-intent.json so the PostToolUse/afterFileEdit hook can append an HTML o9k-provenance comment. Also use when the user asks where junk markdown came from, or how md provenance works. Skip SKILL.md, AGENTS.md, CLAUDE.md, node_modules, and plugin caches (hook denies those)."
---

# md-provenance — Who wrote this Markdown?

Junk `.md` piles up from agents. Every eligible write gets an HTML comment
log so you can grep the cause later.

## Agent duty (before Write/Edit of a `.md`)

1. Write intent (overwrite OK):

```bash
mkdir -p ~/.o9k
cat > ~/.o9k/md-provenance-intent.json <<'EOF'
{
  "path": "/absolute/path/to/file.md",
  "why": "one short reason",
  "trigger": "user phrase or skill/command that caused this write",
  "who": "optional host:model override"
}
EOF
```

`path` must be the **same absolute path** you pass to Write/Edit.

2. Then Write/Edit the markdown as usual. Prefer the Write/Edit tool — **not**
   `cat >/shell` heredocs (those bypass the hook).

3. The host hook prepends:

```html
<!-- o9k-provenance
who: …
when: …Z
why: …
trigger: …
host: …
-->
```

Newest block is **on top** (append-log). Older blocks stay below.

## Denied paths (no stamp)

`SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, anything under
`node_modules/`, `.git/`, `.claude/plugins/cache/`, `.cursor/skills-cursor/`.

## Analysis

```bash
rg -n "o9k-provenance" -g '*.md' .
# or one file:
rg -n "o9k-provenance|why:|trigger:" path/to/file.md
```

## Hook

Claude: `PostToolUse` matcher `Write|Edit`. Cursor: `afterFileEdit`.
Script: `plugins/o9k-core/scripts/md-provenance.mjs`. Fail-open.
Without intent → `why: unspecified` (still stamped).
