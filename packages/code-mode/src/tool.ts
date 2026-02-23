import type { NativeTool } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import type { CodeModeExecutor } from "./executor.js";
import { generateDeclarations } from "./typegen.js";

export function createCodeModeTool(
  registry: ToolRegistry,
  executor: CodeModeExecutor,
): NativeTool {
  const declarations = generateDeclarations(registry);

  return {
    name: "execute_code",
    description: `Execute TypeScript code with access to the agent's APIs. Write the body of an async function.

Available APIs:

\`\`\`typescript
${declarations}
\`\`\`

Each API call returns { success: boolean, output: string }.
Use console.log() for intermediate output. Return your final result.`,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "The body of an async TypeScript function. Use the 'api' object to call tools.",
        },
      },
      required: ["code"],
    },
    execute: async (params) => {
      const { code } = params as { code: string };
      const result = await executor.execute(code);

      if (result.success) {
        const parts: string[] = [];
        if (result.logs.length > 0) {
          parts.push(`[logs]\n${result.logs.join("\n")}`);
        }
        parts.push(
          typeof result.output === "string"
            ? result.output
            : JSON.stringify(result.output),
        );
        return { success: true, output: parts.join("\n\n") };
      }

      return {
        success: false,
        output: result.error ?? "Code execution failed",
      };
    },
  };
}
