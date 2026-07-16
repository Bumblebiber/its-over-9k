// Turns a title into a URL slug: lowercase, words joined by single hyphens,
// no leading/trailing hyphen, non-alphanumerics dropped.
export function slugify(title) {
  const words = title.split(/[^a-zA-Z0-9]+/);
  let out = "";
  for (let i = 0; i <= words.length; i++) {
    if (!words[i]) continue;
    out += words[i].toLowerCase();
    if (i < words.length - 1) out += "-";
  }
  return out;
}
