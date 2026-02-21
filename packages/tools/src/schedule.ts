import type { NativeTool } from "@augure/types";

export const scheduleTool: NativeTool = {
  name: "schedule",
  description: "Manage scheduled tasks: create, delete, or list cron jobs",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "delete", "list"],
        description: "The scheduling action to perform",
      },
      id: { type: "string", description: "The schedule ID (for create/delete)" },
      cron: { type: "string", description: "Cron expression (for create)" },
      prompt: { type: "string", description: "The prompt to execute on schedule (for create)" },
    },
    required: ["action"],
  },
  execute: async (params, ctx) => {
    const { action, id, cron, prompt } = params as {
      action: string;
      id?: string;
      cron?: string;
      prompt?: string;
    };

    try {
      switch (action) {
        case "list": {
          const jobs = ctx.scheduler.listJobs();
          if (jobs.length === 0) {
            return { success: true, output: "No scheduled jobs." };
          }
          const lines = jobs.map(
            (j) => `- ${j.id}: "${j.prompt}" @ ${j.cron} (${j.enabled ? "enabled" : "disabled"})`,
          );
          return { success: true, output: lines.join("\n") };
        }
        case "create": {
          if (!cron || !prompt) {
            return { success: false, output: "Missing required fields: cron and prompt" };
          }
          const jobId = id ?? `job-${Date.now()}`;
          ctx.scheduler.addJob({
            id: jobId,
            cron,
            prompt,
            channel: "default",
            enabled: true,
          });
          return { success: true, output: `Created job ${jobId}` };
        }
        case "delete": {
          if (!id) {
            return { success: false, output: "Missing required field: id" };
          }
          ctx.scheduler.removeJob(id);
          return { success: true, output: `Deleted job ${id}` };
        }
        default:
          return { success: false, output: `Unknown action: ${action}` };
      }
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
