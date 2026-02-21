import { describe, it, expect, vi } from "vitest";
import { memoryReadTool, memoryWriteTool } from "../memory.js";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

function makeCtx(memoryOverrides: Partial<MemoryStore> = {}): ToolContext {
  return {
    config: {} as ToolContext["config"],
    memory: {
      read: vi.fn().mockResolvedValue("file content"),
      write: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(true),
      ...memoryOverrides,
    } as unknown as MemoryStore,
    scheduler: {} as Scheduler,
  };
}

describe("memoryReadTool", () => {
  it("should read from memory store", async () => {
    const ctx = makeCtx();
    const result = await memoryReadTool.execute({ path: "observations.md" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe("file content");
    expect(ctx.memory.read).toHaveBeenCalledWith("observations.md");
  });

  it("should return error on read failure", async () => {
    const ctx = makeCtx({
      read: vi.fn().mockRejectedValue(new Error("not found")),
    });
    const result = await memoryReadTool.execute({ path: "missing.md" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("not found");
  });

  it("should list files when path is omitted", async () => {
    const ctx = makeCtx({
      list: vi.fn().mockResolvedValue(["a.md", "b.md"]),
    });
    const result = await memoryReadTool.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("a.md");
    expect(result.output).toContain("b.md");
  });
});

describe("memoryWriteTool", () => {
  it("should write to memory store", async () => {
    const ctx = makeCtx();
    const result = await memoryWriteTool.execute(
      { path: "notes.md", content: "hello" },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.memory.write).toHaveBeenCalledWith("notes.md", "hello");
  });

  it("should return error on write failure", async () => {
    const ctx = makeCtx({
      write: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    const result = await memoryWriteTool.execute(
      { path: "x.md", content: "y" },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain("disk full");
  });
});
