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
    return this.list().map((tool) => {
      let description = tool.description;
      if (tool.configCheck && this.context) {
        try {
          const warning = tool.configCheck(this.context);
          if (warning) {
            description += `\n[NOT CONFIGURED] ${warning}`;
          }
        } catch {
          // Ignore configCheck errors -- tool remains available with original description
        }
      }
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description,
          parameters: tool.parameters,
        },
      };
    });
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
