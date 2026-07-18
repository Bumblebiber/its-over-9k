import path from "node:path";
import process from "node:process";

export function o9kStatuslineCommand(marketplaceRoot, host) {
  const script = path.join(marketplaceRoot, "o9k-core/scripts/statusline/o9k-statusline.mjs");
  return `${process.execPath} ${script} --host ${host}`;
}

export function isO9kStatuslineCommand(cmd) {
  return typeof cmd === "string" && cmd.includes("o9k-statusline");
}
