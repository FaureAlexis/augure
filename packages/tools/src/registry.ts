import type { NativeTool, ToolContext, ToolResult, FunctionSchema } from "@augure/types";

export type { FunctionSchema };

export class ToolRegistry {
  private tools = new Map<string, NativeTool>();
  private context: ToolContext | undefined;

  register(tool: NativeTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): NativeTool | undefined {
    return this.tools.get(name);
  }

  list(): NativeTool[] {
    return Array.from(this.tools.values());
  }

  toFunctionSchemas(): FunctionSchema[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(params, this.context!);
  }

  setContext(ctx: ToolContext): void {
    this.context = ctx;
  }
}
