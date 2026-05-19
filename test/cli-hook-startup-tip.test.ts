import { describe, it, expect } from "vitest";
import { TIP_BLOCK } from "../src/cli-hook-startup.js";

describe("session-start tip block", () => {
  it("exports a TIP_BLOCK constant", () => {
    expect(typeof TIP_BLOCK).toBe("string");
    expect(TIP_BLOCK.length).toBeGreaterThan(0);
  });

  it("starts with a --- Tip --- separator", () => {
    expect(TIP_BLOCK).toMatch(/^\s*\n?--- Tip ---/);
  });

  it("references 'hmem help' with the shell-exec prefix", () => {
    expect(TIP_BLOCK).toContain("! hmem help");
  });

  it("mentions quick tips", () => {
    expect(TIP_BLOCK.toLowerCase()).toContain("tip");
  });
});
