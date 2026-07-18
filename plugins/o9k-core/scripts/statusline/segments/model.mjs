export function renderModel(canonical) {
  const name = canonical?.model?.display_name;
  return name ? String(name) : "mdl:—";
}
