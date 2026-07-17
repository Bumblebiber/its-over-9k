/**
 * Pure vitest JSON reporter → compact failure summary.
 * @param {string} text
 * @returns {{ summary: string, stats: { failed: number, passed: number, total: number } }}
 */
export function extractVitestJson(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      summary: `WARN: vitest JSON parse failed: ${msg}`,
      stats: { failed: -1, passed: 0, total: 0 },
    };
  }

  const failures = [];
  for (const suite of doc.testResults ?? []) {
    const file = suite.name ?? "unknown";
    for (const a of suite.assertionResults ?? []) {
      if (a.status !== "failed") continue;
      const line =
        a.location?.line ??
        firstStackLine(a.failureMessages?.[0], file) ??
        "?";
      const shortFile = file.replace(/^.*\//, "");
      const name = a.fullName || a.title || "unnamed";
      const tip = firstErrorLine(a.failureMessages?.[0] ?? "");
      failures.push({ shortFile, line, name, tip });
    }
  }

  const failed =
    typeof doc.numFailedTests === "number"
      ? doc.numFailedTests
      : failures.length;
  const passed =
    typeof doc.numPassedTests === "number" ? doc.numPassedTests : 0;
  const total =
    typeof doc.numTotalTests === "number" ? doc.numTotalTests : failed + passed;

  const stats = { failed, passed, total };
  const header = `vitest: ${failed} failed, ${passed} passed, ${total} total`;

  if (failed === 0 && failures.length === 0) {
    return { summary: `${header}\nOK`, stats };
  }

  const lines = [header, ""];
  for (const f of failures) {
    lines.push(`FAIL ${f.shortFile}:${f.line}`);
    lines.push(`  ${f.name}`);
    if (f.tip) lines.push(`  ${f.tip}`);
  }

  let summary = lines.join("\n");
  const max = 2048;
  if (Buffer.byteLength(summary, "utf8") > max) {
    // Prefer keeping header + as many FAIL blocks as fit
    summary = truncateUtf8(summary, max);
  }
  return { summary, stats };
}

function firstErrorLine(msg) {
  if (!msg) return "";
  const line = String(msg).split("\n").find((l) => l.trim()) ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function firstStackLine(msg, fileHint) {
  if (!msg) return null;
  const base = fileHint.replace(/^.*\//, "");
  const re = new RegExp(
    `${escapeRe(base)}:(\\d+)(?::\\d+)?`,
  );
  const m = String(msg).match(re);
  return m ? Number(m[1]) : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncateUtf8(s, maxBytes) {
  const suffix = "\n…(truncated)";
  const budget = Math.max(0, maxBytes - Buffer.byteLength(suffix, "utf8"));
  let out = Buffer.from(s, "utf8").subarray(0, budget).toString("utf8");
  while (Buffer.byteLength(out, "utf8") > budget) out = out.slice(0, -1);
  return out + suffix;
}
