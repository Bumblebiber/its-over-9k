import os from "node:os";

/**
 * Reliable home directory across platforms.
 * On Win32, USERPROFILE is preferred — os.homedir() respects HOME which in
 * MSYS2/Git-Bash may point to a network drive (H:\).
 * On POSIX, HOME is honored explicitly so test harnesses can override it.
 */
export function safeHomedir(): string {
  if (process.platform === "win32" && process.env.USERPROFILE) {
    return process.env.USERPROFILE;
  }
  return process.env.HOME || os.homedir();
}
