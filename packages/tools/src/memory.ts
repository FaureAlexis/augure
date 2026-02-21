import type { NativeTool } from "@augure/types";

export const memoryReadTool: NativeTool = {
  name: "memory_read",
  description: "Read content from memory at the given path",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The memory path to read from" },
    },
    required: ["path"],
  },
  execute: async () => ({ success: false, output: "Not wired yet" }),
};

export const memoryWriteTool: NativeTool = {
  name: "memory_write",
  description: "Write content to memory at the given path",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The memory path to write to" },
      content: { type: "string", description: "The content to write" },
    },
    required: ["path", "content"],
  },
  execute: async () => ({ success: false, output: "Not wired yet" }),
};
