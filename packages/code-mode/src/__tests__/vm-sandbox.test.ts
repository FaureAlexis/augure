import { describe, it, expect, vi } from "vitest";
import type { NativeTool } from "@augure/types";
import { ToolRegistry } from "@augure/tools";
import { VmExecutor } from "../vm-sandbox.js";

function stubTool(
  name: string,
  executeFn?: NativeTool["execute"],
): NativeTool {
  return {
    name,
    description: `${name} tool`,
    parameters: {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
    execute: executeFn ?? (async () => ({ success: true, output: "ok" })),
  };
}

function createRegistry(...tools: NativeTool[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

describe("VmExecutor", () => {
  it("should execute simple code that returns a value", async () => {
    const registry = createRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });

    const result = await executor.execute("return 42;");

    expect(result.success).toBe(true);
    expect(result.output).toBe(42);
    expect(result.logs).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(result.toolCalls).toBe(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("should execute code that calls a tool via api proxy", async () => {
    const executeFn = vi.fn(async () => ({
      success: true,
      output: "echoed: hello",
    }));
    const registry = createRegistry(stubTool("echo", executeFn));
    const executor = new VmExecutor(registry, { timeout: 5000 });

    const result = await executor.execute(
      `const res = await api.echo({ input: "hello" }); return res.output;`,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe("echoed: hello");
    expect(result.toolCalls).toBe(1);
    expect(executeFn).toHaveBeenCalledOnce();
  });

  it("should capture console.log output into logs array", async () => {
    const registry = createRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });

    const result = await executor.execute(
      `console.log("hello"); console.warn("careful"); console.error("oops"); return "done";`,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe("done");
    expect(result.logs).toEqual([
      "hello",
      "[warn] careful",
      "[error] oops",
    ]);
  });

  it("should handle code that throws an error", async () => {
    const registry = createRegistry();
    const executor = new VmExecutor(registry, { timeout: 5000 });

    const result = await executor.execute(
      `throw new Error("something broke");`,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("something broke");
    expect(result.toolCalls).toBe(0);
  });

  it("should handle code that calls multiple tools", async () => {
    const executeFn = vi.fn(async () => ({
      success: true,
      output: "done",
    }));
    const registry = createRegistry(
      stubTool("toolA", executeFn),
      stubTool("toolB", executeFn),
    );
    const executor = new VmExecutor(registry, { timeout: 5000 });

    const result = await executor.execute(
      `await api.toolA({ input: "a" }); await api.toolB({ input: "b" }); await api.toolA({ input: "c" }); return "ok";`,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe("ok");
    expect(result.toolCalls).toBe(3);
    expect(executeFn).toHaveBeenCalledTimes(3);
  });

  it("should time out on slow async code", async () => {
    const registry = createRegistry();
    const executor = new VmExecutor(registry, { timeout: 500 });

    const result = await executor.execute(
      `await new Promise(r => setTimeout(r, 10000)); return "never";`,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Timeout");
    expect(result.durationMs).toBeLessThan(3000);
  });
});
