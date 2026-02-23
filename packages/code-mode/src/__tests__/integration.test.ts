import { describe, it, expect } from "vitest";
import type { ToolContext } from "@augure/types";
import { ToolRegistry } from "@augure/tools";
import { generateDeclarations, createCodeModeTool, VmExecutor } from "../index.js";

describe("code-mode integration", () => {
  function makeRegistry(): ToolRegistry {
    const r = new ToolRegistry();
    r.register({
      name: "memory_read",
      description: "Read a memory file",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path" } },
        required: ["path"],
      },
      execute: async (params: unknown) => ({
        success: true,
        output: `Contents of ${(params as { path: string }).path}`,
      }),
    });
    r.register({
      name: "memory_write",
      description: "Write to a memory file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
      execute: async (params: unknown) => ({
        success: true,
        output: `Written to ${(params as { path: string }).path}`,
      }),
    });
    r.setContext({} as ToolContext);
    return r;
  }

  it("typegen produces declarations for all registered tools", () => {
    const registry = makeRegistry();
    const declarations = generateDeclarations(registry);

    expect(declarations).toContain("interface MemoryReadInput");
    expect(declarations).toContain("interface MemoryWriteInput");
    expect(declarations).toContain("memory_read");
    expect(declarations).toContain("memory_write");
    expect(declarations).toContain("Promise<{ success: boolean; output: string }>");
  });

  it("full flow: typegen → VmExecutor → tool execution", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });

    const result = await executor.execute(`
      const data = await api.memory_read({ path: "notes.md" });
      return data.output;
    `);

    expect(result.success).toBe(true);
    expect(result.output).toBe("Contents of notes.md");
    expect(result.toolCalls).toBe(1);
  });

  it("full flow: multi-tool chaining", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });

    const result = await executor.execute(`
      const data = await api.memory_read({ path: "notes.md" });
      await api.memory_write({ path: "copy.md", content: data.output });
      return "done";
    `);

    expect(result.success).toBe(true);
    expect(result.output).toBe("done");
    expect(result.toolCalls).toBe(2);
  });

  it("createCodeModeTool produces a working NativeTool", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });
    const tool = createCodeModeTool(registry, executor);

    expect(tool.name).toBe("execute_code");
    expect(tool.description).toContain("memory_read");
    expect(tool.description).toContain("memory_write");

    const result = await tool.execute(
      { code: 'return await api.memory_read({ path: "test.md" });' },
      {} as ToolContext,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Contents of test.md");
  });

  it("code mode handles errors gracefully", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });
    const tool = createCodeModeTool(registry, executor);

    const result = await tool.execute(
      { code: 'throw new Error("user error");' },
      {} as ToolContext,
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain("user error");
  });

  it("code mode captures console.log output in tool result", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });
    const tool = createCodeModeTool(registry, executor);

    const result = await tool.execute(
      { code: 'console.log("debug info"); return "final result";' },
      {} as ToolContext,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("debug info");
    expect(result.output).toContain("final result");
  });
});
