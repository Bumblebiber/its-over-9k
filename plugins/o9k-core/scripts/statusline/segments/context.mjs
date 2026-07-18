export function renderContext(canonical) {
  const u = canonical?.context?.used_percentage;
  if (typeof u !== "number" || Number.isNaN(u)) return "ctx:—";
  return `ctx:${Math.round(u)}%`;
}
