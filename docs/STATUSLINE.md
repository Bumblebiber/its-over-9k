# Statusline — renderer included, wiring is yours

o9k ships a statusline **renderer**. It does **not** write itself into your
host's config, and it never will. Four lines of JSON, pasted once, in exchange
for a chunk of the repo that used to break whenever a host shipped an update.

The renderer shows what o9k actually knows that your CLI doesn't: how much of
your subscription window is gone (`limits`, from `~/.o9k/usage.json`), plus
model, context, git and device.

## Why the auto-wiring was removed (2026-07-24)

It was 828 lines against three moving targets it did not own:

- **Claude / Cursor** — writing into `~/.claude/settings.json` and
  `~/.cursor/cli-config.json`, with backups, keep/replace modes, and a doctor
  check to notice when it drifted.
- **Hermes** — *source-patching* `~/.hermes/hermes-agent/cli.py` via three
  regex anchors, designed to interleave with TIM's own patch of the same file.
  It already had a `"cli.py anchor not found"` failure mode. Any Hermes
  release could turn it into a silent no-op or a broken status bar.

The renderer, by contrast, reads o9k's own `~/.o9k/usage.json` and treats the
host payload defensively (25 lines in `normalize.mjs`, missing fields degrade
to `—`). It has no upstream to chase. So: renderer stays, wiring goes.

Anything below is **a snapshot dated 2026-07-24**, verified against the hosts
as they behaved then. It is not tracked against later host releases — if your
host changed its config format, the format wins, not this page.

## Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /ABSOLUTE/PATH/TO/its-over-9k/plugins/o9k-core/scripts/statusline/o9k-statusline.mjs --host claude"
  }
}
```

## Cursor

Same shape, in `~/.cursor/cli-config.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /ABSOLUTE/PATH/TO/its-over-9k/plugins/o9k-core/scripts/statusline/o9k-statusline.mjs --host cursor"
  }
}
```

Find the absolute path with:

```bash
ls "$(dirname "$(find ~ -name o9k-statusline.mjs -path '*o9k-core*' 2>/dev/null | head -1)")"/o9k-statusline.mjs
```

If you later move or re-clone the marketplace, this path breaks and the
statusline silently disappears. `o9k-doctor.mjs` reports exactly that case.

## Hermes

**Not supported.** Hermes renders its own status bar inside `cli.py` and has
no statusLine hook, so the only way in is patching its source — which is
precisely what was removed. If you want it there, patch your own `cli.py`;
o9k will not do it for you or support the result.

## Codex / OpenCode

No statusLine API as of 2026-07-24. Nothing to wire.

## Configuring what's shown

`~/.o9k/statusline.json`, read by the renderer at every invocation:

```json
{
  "enabled": true,
  "elements": ["limits", "context", "model", "git"]
}
```

Available elements: `tim`, `device`, `limits`, `context`, `model`, `git`.
Order is the display order. Missing file → defaults.

Test it without a host:

```bash
echo '{}' | node plugins/o9k-core/scripts/statusline/o9k-statusline.mjs --host claude
```

## Removing an old o9k-wired statusline

Installed by o9k ≤ 0.10.x? The removal path is still shipped:

```bash
node plugins/o9k-core/scripts/o9k-doctor.mjs            # reports it as "legacy"
node plugins/o9k-core/scripts/o9k-uninstall.mjs --dry-run   # then --run
```

That strips the o9k `statusLine` command from Claude/Cursor configs and
reverses the Hermes `cli.py` patch, leaving foreign statuslines and TIM's own
patch untouched.
