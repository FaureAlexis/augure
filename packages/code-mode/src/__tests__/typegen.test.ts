import { describe, it, expect } from "vitest";
import type { NativeTool } from "@augure/types";
import { ToolRegistry } from "@augure/tools";
import { sanitizeName, generateDeclarations } from "../typegen.js";

function stubTool(
  name: string,
  overrides?: Partial<Pick<NativeTool, "description" | "parameters">>,
): NativeTool {
  return {
    name,
    description: overrides?.description ?? `${name} tool`,
    parameters: overrides?.parameters ?? {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
    execute: async () => ({ success: true, output: "ok" }),
  };
}

describe("sanitizeName", () => {
  it("should replace hyphens with underscores", () => {
    expect(sanitizeName("my-tool")).toBe("my_tool");
  });

  it("should replace dots with underscores", () => {
    expect(sanitizeName("my.tool")).toBe("my_tool");
  });

  it("should replace spaces with underscores", () => {
    expect(sanitizeName("my tool")).toBe("my_tool");
  });

  it("should leave valid names unchanged", () => {
    expect(sanitizeName("my_tool")).toBe("my_tool");
    expect(sanitizeName("echo")).toBe("echo");
  });

  it("should handle multiple special characters", () => {
    expect(sanitizeName("my-cool.tool name")).toBe("my_cool_tool_name");
  });
});

describe("generateDeclarations", () => {
  it("should generate declarations for a single tool", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("echo"));

    const result = generateDeclarations(registry);

    expect(result).toContain("interface EchoInput {");
    expect(result).toContain("  input: string;");
    expect(result).toContain("declare const api: {");
    expect(result).toContain(
      "  echo: (input: EchoInput) => Promise<{ success: boolean; output: string }>;",
    );
  });

  it("should mark non-required properties as optional", () => {
    const registry = new ToolRegistry();
    registry.register(
      stubTool("fetch", {
        parameters: {
          type: "object",
          properties: {
            url: { type: "string" },
            timeout: { type: "number" },
          },
          required: ["url"],
        },
      }),
    );

    const result = generateDeclarations(registry);

    expect(result).toContain("  url: string;");
    expect(result).toContain("  timeout?: number;");
  });

  it("should handle multiple tools in registry", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("echo"));
    registry.register(stubTool("fetch"));

    const result = generateDeclarations(registry);

    expect(result).toContain("interface EchoInput {");
    expect(result).toContain("interface FetchInput {");
    expect(result).toContain("  echo: (input: EchoInput)");
    expect(result).toContain("  fetch: (input: FetchInput)");
  });

  it("should sanitize tool names with hyphens in both interface and api entries", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("web-search"));

    const result = generateDeclarations(registry);

    expect(result).toContain("interface WebSearchInput {");
    expect(result).toContain("  web_search: (input: WebSearchInput)");
    // Should not contain the raw hyphenated name in declarations
    expect(result).not.toContain("web-search:");
  });

  it("should include JSDoc comments from field descriptions", () => {
    const registry = new ToolRegistry();
    registry.register(
      stubTool("search", {
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
            limit: { type: "number", description: "Max results to return" },
          },
          required: ["query"],
        },
      }),
    );

    const result = generateDeclarations(registry);

    expect(result).toContain("  /** The search query */");
    expect(result).toContain("  /** Max results to return */");
  });

  it("should include JSDoc comments from tool descriptions on api entries", () => {
    const registry = new ToolRegistry();
    registry.register(
      stubTool("echo", { description: "Echoes input back to the user" }),
    );

    const result = generateDeclarations(registry);

    expect(result).toContain("  /** Echoes input back to the user */");
  });

  it("should map all JSON Schema types correctly", () => {
    const registry = new ToolRegistry();
    registry.register(
      stubTool("types-test", {
        parameters: {
          type: "object",
          properties: {
            s: { type: "string" },
            n: { type: "number" },
            i: { type: "integer" },
            b: { type: "boolean" },
            a: { type: "array" },
            o: { type: "object" },
          },
          required: ["s", "n", "i", "b", "a", "o"],
        },
      }),
    );

    const result = generateDeclarations(registry);

    expect(result).toContain("  s: string;");
    expect(result).toContain("  n: number;");
    expect(result).toContain("  i: number;");
    expect(result).toContain("  b: boolean;");
    expect(result).toContain("  a: unknown[];");
    expect(result).toContain("  o: Record<string, unknown>;");
  });

  it("should map enum types to union of string literals", () => {
    const registry = new ToolRegistry();
    registry.register(
      stubTool("color-picker", {
        parameters: {
          type: "object",
          properties: {
            color: { type: "string", enum: ["red", "green", "blue"] },
          },
          required: ["color"],
        },
      }),
    );

    const result = generateDeclarations(registry);

    expect(result).toContain('  color: "red" | "green" | "blue";');
  });

  it("should produce an empty api block for an empty registry", () => {
    const registry = new ToolRegistry();

    const result = generateDeclarations(registry);

    expect(result).toContain("declare const api: {");
    expect(result).toContain("};");
    // No tool entries between the braces
    const apiMatch = result.match(/declare const api: \{([\s\S]*?)\};/);
    expect(apiMatch).not.toBeNull();
    expect(apiMatch![1].trim()).toBe("");
  });

  it("should handle tools with no properties", () => {
    const registry = new ToolRegistry();
    registry.register(
      stubTool("ping", {
        parameters: {
          type: "object",
          properties: {},
        },
      }),
    );

    const result = generateDeclarations(registry);

    expect(result).toContain("interface PingInput {\n\n}");
    expect(result).toContain("  ping: (input: PingInput)");
  });
});
