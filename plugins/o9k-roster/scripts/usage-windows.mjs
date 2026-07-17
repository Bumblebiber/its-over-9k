// usage-windows.mjs — shared window gating, reset expiry, freshness checks.

const MONTH = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Conservative max age per window key when resets_at is missing (hot windows only). */
export const WINDOW_MAX_AGE_MS = {
  "claude:session": 5 * 3_600_000,
  "claude:5h": 5 * 3_600_000,
  "claude:week": 7 * 86_400_000,
  "claude:fable-week": 7 * 86_400_000,
  "codex:weekly": 7 * 86_400_000,
  "cursor:included": 30 * 86_400_000,
  "cursor:auto": 30 * 86_400_000,
  "cursor:api": 30 * 86_400_000,
};

export function windowMaxAgeMs(wkey) {
  if (WINDOW_MAX_AGE_MS[wkey]) return WINDOW_MAX_AGE_MS[wkey];
  const prefix = wkey.split(":")[0];
  if (prefix === "claude") return 7 * 86_400_000;
  if (prefix === "codex") return 7 * 86_400_000;
  if (prefix === "cursor") return 30 * 86_400_000;
  return 7 * 86_400_000;
}

function parseCodexResetUtc(str, now) {
  const m = /^(\d{1,2}):(\d{2})\s+on\s+(\d{1,2})\s+([A-Za-z]+)/i.exec(str.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const min = Number(m[2]);
  const day = Number(m[3]);
  const month = MONTH[m[4].toLowerCase().slice(0, 3)];
  if (month === undefined) return null;
  const year = new Date(now).getUTCFullYear();
  let ts = Date.UTC(year, month, day, hour, min, 0);
  if (ts < now) ts = Date.UTC(year + 1, month, day, hour, min, 0);
  return ts;
}

/** Best-effort parse of CLI /usage reset strings. null = unknown (no timed expiry). */
export function parseResetAt(str, now = Date.now()) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  const direct = Date.parse(trimmed);
  if (Number.isFinite(direct)) return direct;
  return parseCodexResetUtc(trimmed, now);
}

/**
 * When resets_at is missing/unparseable, hot windows (≥ handoffAt) still expire
 * after windowMaxAgeMs from updated so 100% readings cannot stick forever.
 */
export function effectiveResetAt(w, wkey, handoffAt = 0.95, now = Date.now()) {
  const parsed = parseResetAt(w?.resets_at, now);
  if (parsed !== null) return parsed;
  if (typeof w?.used !== "number" || w.used < handoffAt) return null;
  const updated = Date.parse(w?.updated || "");
  if (!Number.isFinite(updated)) return null;
  return updated + windowMaxAgeMs(wkey);
}

/** Window blocks only when used ≥ threshold AND reset/staleness ceiling has not passed. */
export function windowIsBlocking(wkey, usage, handoffAt, now = Date.now()) {
  const w = usage?.windows?.[wkey];
  if (!w || typeof w.used !== "number") return false;
  const resetAt = effectiveResetAt(w, wkey, handoffAt, now);
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
