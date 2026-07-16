/**
 * Idempotent hook JSON merge for Claude/Codex nested shape and Cursor flat shape.
 */

const DEFAULT_OWNER_PREFIX = "o9k-";

function clone(value) {
  return structuredClone(value);
}

function isO9kCommand(command, ownerPrefix = DEFAULT_OWNER_PREFIX) {
  if (typeof command !== "string") return false;
  return command.includes("run-o9k-hook.sh") || command.includes(`/${ownerPrefix}`);
}

function stripO9kNestedHooks(groups, ownerPrefix) {
  return groups.map((group) => ({
    ...group,
    hooks: (group.hooks ?? []).filter((entry) => !isO9kCommand(entry.command, ownerPrefix)),
  }));
}

function mergeNestedGroups(existingGroups, patchGroups, ownerPrefix) {
  const result = stripO9kNestedHooks(existingGroups, ownerPrefix);

  for (const patchGroup of patchGroups) {
    const matcher = patchGroup.matcher ?? "";
    let target = result.find((group) => (group.matcher ?? "") === matcher);
    if (!target) {
      target = { ...patchGroup, hooks: [] };
      result.push(target);
    }
    const patchHooks = patchGroup.hooks ?? [];
    target.hooks = [...(target.hooks ?? []), ...patchHooks.map((h) => ({ ...h }))];
  }

  return result;
}

/**
 * Merge Claude/Codex nested hook config: { hooks: { Event: [{ matcher, hooks: [...] }] } }
 */
export function mergeHooksJson(existing, patch, options = {}) {
  const ownerPrefix = options.ownerPrefix ?? DEFAULT_OWNER_PREFIX;
  const out = clone(existing ?? {});
  out.hooks = out.hooks ?? {};

  const patchHooks = patch?.hooks ?? {};
  const eventKeys = new Set([...Object.keys(out.hooks), ...Object.keys(patchHooks)]);

  for (const event of eventKeys) {
    const existingGroups = out.hooks[event] ?? [];
    const patchGroups = patchHooks[event] ?? [];
    if (patchGroups.length === 0) {
      out.hooks[event] = stripO9kNestedHooks(existingGroups, ownerPrefix);
    } else {
      out.hooks[event] = mergeNestedGroups(existingGroups, patchGroups, ownerPrefix);
    }
  }

  return out;
}

function stripO9kFlatHooks(entries, ownerPrefix) {
  return entries.filter((entry) => !isO9kCommand(entry.command, ownerPrefix));
}

/**
 * Merge Cursor flat hook config: { version: 1, hooks: { sessionStart: [{ command }] } }
 */
export function mergeCursorHooksJson(existing, patch, options = {}) {
  const ownerPrefix = options.ownerPrefix ?? DEFAULT_OWNER_PREFIX;
  const out = clone(existing ?? {});
  out.version = patch?.version ?? out.version ?? 1;
  out.hooks = out.hooks ?? {};

  const patchHooks = patch?.hooks ?? {};
  const eventKeys = new Set([...Object.keys(out.hooks), ...Object.keys(patchHooks)]);

  for (const event of eventKeys) {
    const existingEntries = out.hooks[event] ?? [];
    const patchEntries = patchHooks[event] ?? [];
    const kept = stripO9kFlatHooks(existingEntries, ownerPrefix);
    out.hooks[event] = [...kept, ...patchEntries.map((e) => ({ ...e }))];
  }

  return out;
}
