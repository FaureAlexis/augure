import { describe, it, expect, vi } from "vitest";
import type { NativeTool } from "@augure/types";
import { ToolRegistry } from "@augure/tools";
import { createBridgeHandler, generateHarnessCode } from "../bridge.js";

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

describe("createBridgeHandler", () => {
  it("should dispatch a tool call to the registry and return the result", async () => {
    const executeFn = vi.fn(async () => ({
      success: true,
      output: "hello world",
    }));
    const registry = new ToolRegistry();
    registry.register(stubTool("echo", executeFn));

    const handler = createBridgeHandler(registry);
    const result = await handler("echo", { input: "test" });

    expect(result).toEqual({ success: true, output: "hello world" });
    expect(executeFn).toHaveBeenCalledOnce();
  });

  it("should return an error result for an unknown tool", async () => {
    const registry = new ToolRegistry();

    const handler = createBridgeHandler(registry);
    const result = await handler("nonexistent", { input: "test" });

    expect(result.success).toBe(false);
    expect(result.output).toContain("Bridge error calling nonexistent");
    expect(result.output).toContain("Tool not found: nonexistent");
  });

  it("should catch tool execution errors and return an error result", async () => {
    const executeFn = vi.fn(async () => {
      throw new Error("disk full");
    });
    const registry = new ToolRegistry();
    registry.register(stubTool("failing", executeFn));

    const handler = createBridgeHandler(registry);
    const result = await handler("failing", {});

    expect(result.success).toBe(false);
    expect(result.output).toContain("Bridge error calling failing");
    expect(result.output).toContain("disk full");
  });
});

describe("generateHarnessCode", () => {
  it("should wrap user code in an async function with api proxy", () => {
    const harness = generateHarnessCode("return await api.echo({ input: 'hi' });");

    expect(harness).toContain("new Proxy");
    expect(harness).toContain("__bridge");
    expect(harness).toContain("return await api.echo({ input: 'hi' });");
  });

  it("should capture console output via __logs", () => {
    const harness = generateHarnessCode("console.log('test');");

    expect(harness).toContain("__logs");
    expect(harness).toContain("console.log = ");
    expect(harness).toContain("console.warn = ");
    expect(harness).toContain("console.error = ");
    expect(harness).toContain("[warn]");
    expect(harness).toContain("[error]");
  });

  it("should wrap output in JSON with success/output/logs/toolCalls structure", () => {
    const harness = generateHarnessCode("return 42;");

    expect(harness).toContain("JSON.stringify");
    expect(harness).toContain("success: true");
    expect(harness).toContain("output: __result");
    expect(harness).toContain("logs: __logs");
    expect(harness).toContain("toolCalls: __toolCalls");
    // Error path
    expect(harness).toContain("success: false");
    expect(harness).toContain("error: err.message");
  });
});
