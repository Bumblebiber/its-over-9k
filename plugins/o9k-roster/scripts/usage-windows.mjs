// usage-windows.mjs — shared window gating, reset expiry, freshness checks.

/** Best-effort parse of CLI /usage reset strings. null = unknown (do not expire). */
export function parseResetAt(str, now = Date.now()) {
  if (!str || typeof str !== "string") return null;
  const direct = Date.parse(str);
  if (Number.isFinite(direct)) return direct;
  // "17:26 on 23 Jul" (codex)
  const codex = /(\d{1,2}):(\d{2})\s+on\s+(\d{1,2})\s+(\w+)/i.exec(str);
  if (codex) {
    const year = new Date(now).getFullYear();
    const attempt = Date.parse(`${codex[3]} ${codex[4]} ${year} ${codex[1]}:${codex[2]}:00`);
    if (Number.isFinite(attempt)) return attempt;
  }
  return null;
}

/** Window blocks only when used ≥ threshold AND reset has not passed. */
export function windowIsBlocking(wkey, usage, handoffAt, now = Date.now()) {
  const w = usage?.windows?.[wkey];
  if (!w || typeof w.used !== "number") return false;
  const resetAt = parseResetAt(w.resets_at, now);
  if (resetAt !== null && now >= resetAt) return false;
  return w.used >= handoffAt;
}

/**
 * Per-model usage gate: window data for THIS model's keys when present;
 * otherwise legacy provider/cli scalars.
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function modelUsageGate({ usage, limitWindows, provider, cli, handoffAt, now = Date.now() }) {
  const withData = limitWindows.filter((k) => usage?.windows?.[k] != null);
  if (withData.length > 0) {
    for (const wkey of withData) {
      if (windowIsBlocking(wkey, usage, handoffAt, now)) {
        const used = usage.windows[wkey].used;
        return { blocked: true, reason: `window ${wkey} at ${Math.round(used * 100)}%` };
      }
    }
    return { blocked: false };
  }
  const used = usage?.providers?.[provider]?.used;
  if (typeof used === "number" && used >= handoffAt) {
    return { blocked: true, reason: `provider ${provider} at ${Math.round(used * 100)}%` };
  }
  const cliUsed = usage?.providers?.[cli]?.used;
  if (typeof cliUsed === "number" && cliUsed >= handoffAt) {
    return { blocked: true, reason: `cli ${cli} at ${Math.round(cliUsed * 100)}%` };
  }
  return { blocked: false };
}

/** True when any window for this subscription CLI was updated within maxAgeMs. */
export function isCliUsageFresh(cli, usage, maxAgeMs = 5 * 60_000, now = Date.now()) {
  const prefix = `${cli}:`;
  let newest = 0;
  for (const [k, v] of Object.entries(usage?.windows || {})) {
    if (!k.startsWith(prefix)) continue;
    const t = Date.parse(v?.updated || "");
    if (Number.isFinite(t)) newest = Math.max(newest, t);
  }
  return newest > 0 && now - newest < maxAgeMs;
}
