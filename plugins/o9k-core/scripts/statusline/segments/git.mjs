import { execFileSync } from "node:child_process";

export function renderGit(canonical, opts = {}) {
  const wt = canonical?.worktree?.name;
  let branch = null;
  const cwd = canonical?.cwd || process.cwd();
  try {
    branch = execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    branch = null;
  }
  if (!branch && !wt) return "git:—";
  if (wt && branch) return `${branch}@${wt}`;
  return wt || branch;
}
