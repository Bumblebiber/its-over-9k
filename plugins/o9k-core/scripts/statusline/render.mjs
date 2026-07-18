import { applyMarquee, marqueePath } from "./marquee.mjs";

const SEP = " · ";
const MIN_MQ_SLOT = 4;

function ellipsize(s, max) {
  if (s.length <= max) return s;
  if (max <= 1) return "…".slice(0, max);
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

export function renderLine({ config, segments, width, marqueePath: mqPath }) {
  if (!config?.enabled) return "";
  const keys = (config.elements || []).filter((k) => segments[k] != null && segments[k] !== "");
  const priority = config.priority || keys;
  const parts = Object.fromEntries(keys.map((k) => [k, String(segments[k])]));
  const statePath = mqPath || marqueePath();
  const join = (order) => order.map((k) => parts[k]).filter(Boolean).join(SEP);

  let order = keys.slice();
  const budget = Math.max(1, width || 80);
  const shrinkOrder = [...priority].reverse().filter((k) => order.includes(k));
  const mqKeys = config.marquee?.enabled ? new Set(config.marquee.keys || []) : new Set();
  const joinLen = (ord, forShrink = false) => {
    let len = 0;
    for (const k of ord) {
      const t = parts[k];
      if (!t) continue;
      if (len) len += SEP.length;
      if (forShrink && mqKeys.has(k)) len += Math.min(t.length, MIN_MQ_SLOT);
      else len += t.length;
    }
    return len;
  };

  let guard = 0;
  while (joinLen(order, true) > budget && shrinkOrder.length && guard++ < 200) {
    const victim = shrinkOrder[0];
    const minW = 4;
    if (mqKeys.has(victim)) {
      shrinkOrder.shift();
      continue;
    }
    if ((parts[victim] || "").length > minW) {
      parts[victim] = ellipsize(parts[victim], Math.max(minW, parts[victim].length - 4));
    } else {
      shrinkOrder.shift();
      order = order.filter((k) => k !== victim);
      delete parts[victim];
    }
  }

  if (config.marquee?.enabled) {
    for (const k of order) {
      if (!mqKeys.has(k)) continue;
      const others = join(order.filter((x) => x !== k));
      const slot = Math.max(4, budget - (others ? others.length + SEP.length : 0));
      if (parts[k].length > slot) {
        parts[k] = applyMarquee(k, parts[k], slot, statePath);
      }
    }
  }

  let line = join(order);
  if (line.length > budget) line = ellipsize(line, budget);
  return line;
}
