import { describe, it, expect } from "vitest";
import type { NativeTool } from "@augure/types";
import { ToolRegistry } from "../registry.js";

function stubTool(name: string): NativeTool {
  return {
    name,
    description: `${name} tool`,
    parameters: {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
    execute: async (params: unknown) => ({
      success: true,
      output: `executed ${name} with ${JSON.stringify(params)}`,
    }),
  };
}

describe("ToolRegistry", () => {
  it("should register and retrieve a tool", () => {
    const registry = new ToolRegistry();
    const tool = stubTool("echo");
    registry.register(tool);
    expect(registry.get("echo")).toBe(tool);
  });

  it("should return undefined for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("should list all tools", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("a"));
    registry.register(stubTool("b"));
    registry.register(stubTool("c"));
    const list = registry.list();
    expect(list).toHaveLength(3);
    expect(list.map((t) => t.name)).toEqual(["a", "b", "c"]);
  });

  it("should generate tool schemas for LLM function calling", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("echo"));
    const schemas = registry.toFunctionSchemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0]).toEqual({
      type: "function",
      function: {
        name: "echo",
        description: "echo tool",
        parameters: {
          type: "object",
          properties: { input: { type: "string" } },
          required: ["input"],
        },
      },
    });
  });

  it("should execute a tool by name", async () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("echo"));
    const result = await registry.execute("echo", { input: "hello" });
    expect(result.success).toBe(true);
    expect(result.output).toBe('executed echo with {"input":"hello"}');
  });

  it("should throw on executing unknown tool", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("ghost", {})).rejects.toThrow(
      "Tool not found: ghost",
    );
  });
});
