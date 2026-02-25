import type { NativeTool } from "@augure/types";

export const sandboxExecTool: NativeTool = {
  name: "sandbox_exec",
  description:
    "Execute a shell command in an isolated Docker container. Returns stdout, stderr, and exit code.",
  riskLevel: "high",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      trust: {
        type: "string",
        enum: ["sandboxed", "trusted"],
        description:
          "Trust level (default: sandboxed). 'sandboxed' has no network. 'trusted' has host network.",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: from config)",
      },
    },
    required: ["command"],
  },
  execute: async (params, ctx) => {
    const { command, trust, timeout } = params as {
      command: string;
      trust?: "sandboxed" | "trusted";
      timeout?: number;
    };

    if (!ctx.pool) {
      return { success: false, output: "Sandbox pool is not available" };
    }

    const defaults = ctx.config.sandbox.defaults;
    const effectiveTimeout = timeout ?? defaults.timeout;

    // I9: catch acquire failures
    let container;
    try {
      container = await ctx.pool.acquire({
        trust: trust ?? "sandboxed",
        timeout: effectiveTimeout,
        memory: defaults.memoryLimit,
        cpu: defaults.cpuLimit,
      });
    } catch (err) {
      return {
        success: false,
        output: `Failed to acquire container: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    try {
      const result = await container.exec(command, {
        timeout: effectiveTimeout,
      });

      const parts: string[] = [];
      if (result.stdout) parts.push(result.stdout);
      if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
      parts.push(`Exit code: ${result.exitCode}`);

      return {
        success: result.exitCode === 0,
        output: parts.join("\n"),
      };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await ctx.pool.release(container);
    }
  },
};
