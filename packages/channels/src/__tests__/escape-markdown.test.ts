import { describe, it, expect } from "vitest";
import { escapeMarkdownV2 } from "../middleware/escape-markdown.js";

describe("escapeMarkdownV2", () => {
  it("should escape special characters in plain text", () => {
    expect(escapeMarkdownV2("Hello. How are you?")).toBe("Hello\\. How are you?");
  });

  it("should not escape inside inline code", () => {
    expect(escapeMarkdownV2("Use `array.map()` here")).toBe("Use `array.map()` here");
  });

  it("should not escape inside fenced code blocks", () => {
    const input = "Text:\n```\nfoo.bar()\n```\nEnd.";
    const result = escapeMarkdownV2(input);
    expect(result).toBe("Text:\n```\nfoo.bar()\n```\nEnd\\.");
  });

  it("should preserve bold and italic formatting", () => {
    expect(escapeMarkdownV2("This is *bold* text")).toBe("This is *bold* text");
  });

  it("should escape dots and exclamation marks", () => {
    expect(escapeMarkdownV2("Done! Version 1.0")).toBe("Done\\! Version 1\\.0");
  });

  it("should handle empty string", () => {
    expect(escapeMarkdownV2("")).toBe("");
  });
});
