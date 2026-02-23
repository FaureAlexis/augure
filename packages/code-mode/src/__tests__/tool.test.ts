import { describe, it, expect, vi } from "vitest";
import type { NativeTool, ToolContext } from "@augure/types";
import { ToolRegistry } from "@augure/tools";
import type { CodeModeResult, CodeModeExecutor } from "../executor.js";
import { createCodeModeTool } from "../tool.js";
import { AutoExecutor } from "../auto-executor.js";

function stubTool(name: string): NativeTool {
  return {
    name,
    description: `${name} tool`,
    parameters: {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
    execute: async () => ({ success: true, output: "ok" }),
  };
}

function createRegistry(...tools: NativeTool[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

function mockExecutor(result: Partial<CodeModeResult>): CodeModeExecutor {
  return {
    execute: vi.fn(async () => ({
      success: true,
      output: "test",
      logs: [],
      durationMs: 10,
      toolCalls: 0,
      ...result,
    })),
  };
}

const dummyCtx = {} as ToolContext;

describe("createCodeModeTool", () => {
  it("should create a NativeTool with name 'execute_code' and required 'code' parameter", () => {
    const registry = createRegistry(stubTool("echo"));
    const executor = mockExecutor({});

    const tool = createCodeModeTool(registry, executor);

    expect(tool.name).toBe("execute_code");
    const params = tool.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(params.required).toContain("code");
    expect(params.properties).toHaveProperty("code");
  });

  it("should include generated TypeScript declarations in description", () => {
    const registry = createRegistry(stubTool("echo"));
    const executor = mockExecutor({});

    const tool = createCodeModeTool(registry, executor);

    expect(tool.description).toContain("interface EchoInput {");
    expect(tool.description).toContain("declare const api: {");
    expect(tool.description).toContain("echo: (input: EchoInput)");
  });

  it("should execute code via the executor and return success ToolResult", async () => {
    const registry = createRegistry();
    const executor = mockExecutor({ success: true, output: "hello world" });

    const tool = createCodeModeTool(registry, executor);
    const result = await tool.execute({ code: 'return "hello world";' }, dummyCtx);

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello world");
    expect(executor.execute).toHaveBeenCalledWith('return "hello world";');
  });

  it("should return failure when executor returns unsuccessful result", async () => {
    const registry = createRegistry();
    const executor = mockExecutor({
      success: false,
      output: undefined,
      error: "ReferenceError: x is not defined",
    });

    const tool = createCodeModeTool(registry, executor);
    const result = await tool.execute({ code: "return x;" }, dummyCtx);

    expect(result.success).toBe(false);
    expect(result.output).toBe("ReferenceError: x is not defined");
  });

  it("should return default error message when executor fails without error string", async () => {
    const registry = createRegistry();
    const executor = mockExecutor({
      success: false,
      output: undefined,
      error: undefined,
    });

    const tool = createCodeModeTool(registry, executor);
    const result = await tool.execute({ code: "return x;" }, dummyCtx);

    expect(result.success).toBe(false);
    expect(result.output).toBe("Code execution failed");
  });

  it("should include logs in output when present", async () => {
    const registry = createRegistry();
    const executor = mockExecutor({
      success: true,
      output: "final result",
      logs: ["step 1 done", "step 2 done"],
    });

    const tool = createCodeModeTool(registry, executor);
    const result = await tool.execute({ code: "return 'final result';" }, dummyCtx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("[logs]");
    expect(result.output).toContain("step 1 done");
    expect(result.output).toContain("step 2 done");
    expect(result.output).toContain("final result");
  });

  it("should JSON.stringify non-string output", async () => {
    const registry = createRegistry();
    const executor = mockExecutor({
      success: true,
      output: { key: "value" },
      logs: [],
    });

    const tool = createCodeModeTool(registry, executor);
    const result = await tool.execute({ code: "return { key: 'value' };" }, dummyCtx);

    expect(result.success).toBe(true);
    expect(result.output).toBe('{"key":"value"}');
  });
});

describe("AutoExecutor", () => {
  it("should use primary executor when it succeeds", async () => {
    const primary = mockExecutor({ success: true, output: "primary result" });
    const fallback = mockExecutor({ success: true, output: "fallback result" });
    const auto = new AutoExecutor(primary, fallback);

    const result = await auto.execute("return 42;");

    expect(result.success).toBe(true);
    expect(result.output).toBe("primary result");
    expect(primary.execute).toHaveBeenCalledWith("return 42;");
    expect(fallback.execute).not.toHaveBeenCalled();
  });

  it("should fall back when primary throws (executor crash)", async () => {
    const primary: CodeModeExecutor = {
      execute: vi.fn(async () => {
        throw new Error("VM crashed");
      }),
    };
    const fallback = mockExecutor({ success: true, output: "fallback result" });
    const auto = new AutoExecutor(primary, fallback);

    const result = await auto.execute("return 42;");

    expect(result.success).toBe(true);
    expect(result.output).toBe("fallback result");
    expect(primary.execute).toHaveBeenCalled();
    expect(fallback.execute).toHaveBeenCalledWith("return 42;");
  });

  it("should NOT fall back when primary returns {success: false} (user code error)", async () => {
    const primary = mockExecutor({
      success: false,
      output: undefined,
      error: "TypeError: x is not a function",
    });
    const fallback = mockExecutor({ success: true, output: "fallback result" });
    const auto = new AutoExecutor(primary, fallback);

    const result = await auto.execute("x();");

    expect(result.success).toBe(false);
    expect(result.error).toBe("TypeError: x is not a function");
    expect(fallback.execute).not.toHaveBeenCalled();
  });
});
