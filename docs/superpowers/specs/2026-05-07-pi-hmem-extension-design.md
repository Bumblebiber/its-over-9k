# pi-hmem Extension — Design Spec

**Date:** 2026-05-07  
**Project:** hmem-mcp (P0048)  
**Scope:** TypeScript Extension für Pi Coding Agent, die alle hmem Claude Code Hooks repliziert

---

## Overview

Eine einzelne Datei `src/extensions/pi-hmem.ts` im hmem-mcp Repo implementiert alle hmem-relevanten Hooks als Pi Extension. Sie liegt in `src/` (entspricht `rootDir` in tsconfig) und wird vom bestehenden `tsc`-Build nach `dist/extensions/pi-hmem.js` kompiliert. Installation: `pi install npm:hmem-mcp`.

Die Extension wird nur aktiviert wenn Pi auf dem Gerät installiert ist — der `"pi"` Key in `package.json` ist das Signal, das Pi beim Install erkennt.

---

## Hook-Mapping

| Claude Code Hook | Trigger | Pi Event | Aktion |
|---|---|---|---|
| SessionStart (startup) + UserPromptSubmit | Session-Start | `session_start` (reason=startup) + `before_agent_start` (1. Turn) | `hmem hook-startup` ausführen, Output + Skill-Content in System Prompt injizieren |
| PreToolUse Read | Read-Tool auf `.hmem`-Datei | `tool_call` | `{ block: true, reason: "..." }` |
| PreCompact | Vor Komprimierung | `session_before_compact` | `hmem log-exchange`, `hmem context-inject`, `hmem deactivate` |
| Stop | Nach jeder Agenten-Antwort | `agent_end` | `hmem log-exchange` (debounced) |

---

## Architecture

### Datei: `src/extensions/pi-hmem.ts`

```
session_start (reason=startup)
  → execSync("hmem hook-startup") → startupContext speichern

before_agent_start (nur 1. Turn, Flag)
  → Skill-Datei lesen (relativ zu __dirname)
  → systemPrompt += <important-reminder>skill</important-reminder>
  → systemPrompt += startupContext

tool_call
  → if toolName === "read" && file_path.endsWith(".hmem")
  → return { block: true, reason: "Use hmem MCP tools instead" }

session_before_compact
  → execSync("hmem log-exchange")
  → execSync("hmem context-inject")
  → execSync("hmem deactivate")
  → lastLogTime = Date.now()

agent_end
  → if Date.now() - lastLogTime < 5000: return  (debounce)
  → execSync("hmem log-exchange")
  → lastLogTime = Date.now()
```

### Konfiguration

- **HMEM_PATH**: aus `process.env.HMEM_PATH` — identisch mit Claude Code Setup
- **Skill-Pfad**: `path.join(__dirname, "../../skills/hmem-using-hmem/SKILL.md")` — `__dirname` ist `dist/extensions/`, Skill liegt in `skills/` im Package-Root
- **Graceful degradation**: Alle `exec`-Calls in try/catch — Extension schweigt wenn hmem nicht verfügbar

---

## Package Integration

### `package.json` Ergänzung

```json
{
  "pi": {
    "extensions": ["./dist/extensions/pi-hmem"]
  }
}
```

### `tsconfig.json`

`src/extensions/pi-hmem.ts` liegt bereits im `include: ["src/**/*"]` — keine tsconfig-Änderung nötig.

### Peer Dependency

`@earendil-works/pi-coding-agent` als `peerDependency` (optional, für den `ExtensionAPI`-Type) — **nicht** in `dependencies`, da Pi die eigene Version injiziert.

---

## Build & Install

```bash
# Im hmem-mcp Repo nach der Implementierung:
npx tsc

# Installation in Pi (nach npm publish):
pi install npm:hmem-mcp

# Lokal während Entwicklung:
pi install path:/home/bbbee/projects/hmem
```

---

## Error Handling

- `hmem hook-startup` nicht verfügbar → Extension startet trotzdem, ohne Context-Injection
- Skill-Datei nicht gefunden → System Prompt wird ohne `<important-reminder>` injiziert
- `hmem log-exchange` schlägt fehl → wird still geloggt (kein User-facing Error)
- `session_before_compact` schlägt fehl → Komprimierung läuft trotzdem (`{ cancel: true }` wird nie returned)

---

## Out of Scope

- Pi hat kein Äquivalent zum Claude Code `statusLine` → kein Status-Bar Support
- `hmem deactivate` + `hmem context-inject` nur bei Komprimierung, nicht bei Session-Ende (`session_shutdown`) — das wäre doppelt zu `agent_end`
- Keine UI-Widgets oder TUI-Cards für diese Extension
