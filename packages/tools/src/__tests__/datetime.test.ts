import { describe, it, expect } from "vitest";
import { datetimeTool } from "../datetime.js";
import type { ToolContext } from "@augure/types";

const dummyCtx = {} as ToolContext;

describe("datetimeTool", () => {
  it("should return current date/time in default timezone", async () => {
    const result = await datetimeTool.execute({}, dummyCtx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("ISO 8601 (UTC):");
    expect(result.output).toContain("Unix timestamp:");
  });

  it("should accept a valid IANA timezone", async () => {
    const result = await datetimeTool.execute(
      { timezone: "Europe/Paris" },
      dummyCtx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("GMT");
  });

  it("should fail for an invalid timezone", async () => {
    const result = await datetimeTool.execute(
      { timezone: "Not/A/Timezone" },
      dummyCtx,
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain("Invalid timezone");
  });
});
