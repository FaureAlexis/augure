import type { NativeTool } from "@augure/types";

export const memoryReadTool: NativeTool = {
  name: "memory_read",
  description:
    "Read content from memory. If path is provided, reads that file. If path is omitted, lists all memory files.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The memory file path to read (omit to list all files)",
      },
    },
  },
  execute: async (params, ctx) => {
    const { path } = params as { path?: string };
    try {
      if (!path) {
        const files = await ctx.memory.list();
        return { success: true, output: files.join("\n") };
      }
      const content = await ctx.memory.read(path);
      return { success: true, output: content };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export const memoryWriteTool: NativeTool = {
  name: "memory_write",
  description: "Write content to a memory file at the given path",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The memory file path to write to" },
      content: { type: "string", description: "The content to write" },
    },
    required: ["path", "content"],
  },
  execute: async (params, ctx) => {
    const { path, content } = params as { path: string; content: string };
    try {
      await ctx.memory.write(path, content);
      return { success: true, output: `Written to ${path}` };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
