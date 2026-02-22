import { describe, it, expect } from "vitest";
import { splitText } from "../middleware/split-message.js";

describe("splitText", () => {
  it("should return text as-is when under limit", () => {
    const result = splitText("Hello world", 4096);
    expect(result).toEqual(["Hello world"]);
  });

  it("should split at paragraph boundaries", () => {
    const para1 = "A".repeat(2048);
    const para2 = "B".repeat(2048);
    const text = `${para1}\n\n${para2}`;
    const result = splitText(text, 4096);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(para1);
    expect(result[1]).toBe(para2);
  });

  it("should split at newlines if no paragraph break fits", () => {
    const line1 = "C".repeat(3000);
    const line2 = "D".repeat(3000);
    const text = `${line1}\n${line2}`;
    const result = splitText(text, 4096);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(line1);
    expect(result[1]).toBe(line2);
  });

  it("should hard-split at limit if no break point", () => {
    const text = "X".repeat(5000);
    const result = splitText(text, 4096);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4096);
    expect(result[1]).toHaveLength(904);
  });

  it("should handle empty text", () => {
    expect(splitText("", 4096)).toEqual([""]);
  });

  it("should handle text exactly at limit", () => {
    const text = "Y".repeat(4096);
    expect(splitText(text, 4096)).toEqual([text]);
  });

  it("should close and reopen code blocks across splits", () => {
    const before = "A".repeat(4080);
    const text = `${before}\n\`\`\`js\nconst x = 1;\n\`\`\``;
    const result = splitText(text, 4096);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // First chunk should close the code block
    expect(result[0]).toMatch(/```$/);
    // Second chunk should reopen with the language tag
    expect(result[1]).toMatch(/^```js/);
  });
});
