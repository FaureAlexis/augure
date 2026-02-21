import { describe, it, expect } from "vitest";
import { parseInterval } from "../interval.js";

describe("parseInterval", () => {
  it("should parse minutes", () => {
    expect(parseInterval("30m")).toBe(30 * 60 * 1000);
  });

  it("should parse hours", () => {
    expect(parseInterval("2h")).toBe(2 * 60 * 60 * 1000);
  });

  it("should parse seconds", () => {
    expect(parseInterval("45s")).toBe(45 * 1000);
  });

  it("should throw on invalid format", () => {
    expect(() => parseInterval("abc")).toThrow();
  });

  it("should throw on zero", () => {
    expect(() => parseInterval("0m")).toThrow();
  });
});
