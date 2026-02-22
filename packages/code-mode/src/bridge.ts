import type { ToolResult } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";

export type BridgeHandler = (
  toolName: string,
  input: unknown,
) => Promise<ToolResult>;

export function createBridgeHandler(registry: ToolRegistry): BridgeHandler {
  return async (toolName: string, input: unknown): Promise<ToolResult> => {
    try {
      return await registry.execute(toolName, input);
    } catch (err) {
      return {
        success: false,
        output: `Bridge error calling ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}

export function generateHarnessCode(userCode: string): string {
  return `
const __logs = [];
const __originalLog = console.log;
const __originalWarn = console.warn;
const __originalError = console.error;
console.log = (...args) => __logs.push(args.map(String).join(" "));
console.warn = (...args) => __logs.push("[warn] " + args.map(String).join(" "));
console.error = (...args) => __logs.push("[error] " + args.map(String).join(" "));

let __toolCalls = 0;

const api = new Proxy({}, {
  get: (_target, toolName) => {
    return async (input) => {
      __toolCalls++;
      return await __bridge(String(toolName), input);
    };
  }
});

async function __run() {
  ${userCode}
}

try {
  const __result = await __run();
  __originalLog(JSON.stringify({
    success: true,
    output: __result,
    logs: __logs,
    toolCalls: __toolCalls,
  }));
} catch (err) {
  __originalLog(JSON.stringify({
    success: false,
    error: err.message ?? String(err),
    logs: __logs,
    toolCalls: __toolCalls,
  }));
}
`;
}
