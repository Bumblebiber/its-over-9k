import { describe, it, expect } from "vitest";
import { extractText } from "../src/extensions/pi-hmem.js";

describe("extractText", () => {
  it("returns a plain string unchanged", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("joins text blocks from a ContentBlock array", () => {
    expect(extractText([
      { type: "text", text: "Hello " },
      { type: "tool_use", id: "t1", name: "bash", input: {} },
      { type: "text", text: "world" },
    ])).toBe("Hello world");
  });

  it("returns empty string for array with no text blocks", () => {
    expect(extractText([
      { type: "tool_use", id: "t1", name: "bash", input: {} },
    ])).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });
});
