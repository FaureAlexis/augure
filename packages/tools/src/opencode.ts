import type { NativeTool } from "@augure/types";

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const opencodeTool: NativeTool = {
  name: "opencode",
  description:
    "Run a code agent (claude-code, opencode, codex CLI) in a Docker container to perform a coding task.",
  riskLevel: "high",
  configCheck: (ctx) =>
    ctx.config.sandbox.codeAgent
      ? null
      : "This tool requires sandbox.codeAgent configuration. See https://augure.dev/docs/sandbox",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Natural language task description for the code agent",
      },
      trust: {
        type: "string",
        enum: ["sandboxed", "trusted"],
        description: "Trust level (default: trusted)",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: from config)",
      },
    },
    required: ["task"],
  },
  execute: async (params, ctx) => {
    const { task, trust, timeout } = params as {
      task: string;
      trust?: "sandboxed" | "trusted";
      timeout?: number;
    };

    if (!ctx.pool) {
      return { success: false, output: "Sandbox pool is not available" };
    }

    const agentConfig = ctx.config.sandbox.codeAgent;
    if (!agentConfig) {
      return {
        success: false,
        output: "codeAgent is not configured in sandbox config",
      };
    }

    const defaults = ctx.config.sandbox.defaults;
    const effectiveTimeout = timeout ?? defaults.timeout;

    // I9: catch acquire failures
    let container;
    try {
      container = await ctx.pool.acquire({
        trust: trust ?? "trusted",
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
      const cmdParts = [agentConfig.command];
      if (agentConfig.args) cmdParts.push(...agentConfig.args);
      cmdParts.push(shellEscape(task));
      const command = cmdParts.join(" ");

      const result = await container.exec(command, {
        timeout: effectiveTimeout,
        env: agentConfig.env,
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
