// normalize.mjs — host statusline JSON → canonical payload.
export function normalizePayload(raw, opts = {}) {
  const host = opts.host || "unknown";
  const o = raw && typeof raw === "object" ? raw : {};
  const width =
    Number(o.render_width_chars) > 0 ? Math.floor(Number(o.render_width_chars)) : 80;
  const model =
    o.model && typeof o.model === "object"
      ? {
          id: o.model.id ?? null,
          display_name: o.model.display_name ?? o.model.displayName ?? null,
        }
      : null;
  const cw = o.context_window && typeof o.context_window === "object" ? o.context_window : null;
  const context = cw
    ? {
        used_percentage: cw.used_percentage ?? null,
        remaining_percentage: cw.remaining_percentage ?? null,
      }
    : null;
  const wt = o.worktree && typeof o.worktree === "object" ? o.worktree : null;
  const worktree = wt ? { name: wt.name ?? null, path: wt.path ?? null } : null;
  const cwd = o.cwd || o.workspace?.current_dir || null;
  return { host, cwd, width, model, context, worktree };
}
