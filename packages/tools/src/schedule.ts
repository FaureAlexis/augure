import type { NativeTool } from "@augure/types";

export const scheduleTool: NativeTool = {
  name: "schedule",
  description: "Manage scheduled tasks: create, delete, or list schedules",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "delete", "list"],
        description: "The scheduling action to perform",
      },
      id: { type: "string", description: "The schedule ID (for delete)" },
      cron: {
        type: "string",
        description: "Cron expression (for create)",
      },
      prompt: {
        type: "string",
        description: "The prompt to execute on schedule (for create)",
      },
    },
    required: ["action"],
  },
  execute: async () => ({ success: false, output: "Not wired yet" }),
};
