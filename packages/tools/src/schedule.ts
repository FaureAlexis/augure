import type { NativeTool } from "@augure/types";

export const scheduleTool: NativeTool = {
  name: "schedule",
  description: "Manage scheduled tasks: create recurring (cron) or one-shot (runAt) jobs, delete, or list them",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "delete", "list"],
        description: "The scheduling action to perform",
      },
      id: { type: "string", description: "The schedule ID (for create/delete)" },
      cron: { type: "string", description: "Cron expression for recurring jobs (for create)" },
      runAt: { type: "string", description: "ISO 8601 date for one-shot jobs, e.g. 2025-03-15T14:00:00Z (for create)" },
      prompt: { type: "string", description: "The prompt to execute on schedule (for create)" },
    },
    required: ["action"],
  },
  execute: async (params, ctx) => {
    const { action, id, cron, runAt, prompt } = params as {
      action: string;
      id?: string;
      cron?: string;
      runAt?: string;
      prompt?: string;
    };

    try {
      switch (action) {
        case "list": {
          const jobs = ctx.scheduler.listJobs();
          if (jobs.length === 0) {
            return { success: true, output: "No scheduled jobs." };
          }
          const lines = jobs.map((j) => {
            const schedule = j.cron ? `cron: ${j.cron}` : `runAt: ${j.runAt}`;
            return `- ${j.id}: "${j.prompt}" @ ${schedule} (${j.enabled ? "enabled" : "disabled"})`;
          });
          return { success: true, output: lines.join("\n") };
        }
        case "create": {
          if (!prompt) {
            return { success: false, output: "Missing required field: prompt" };
          }
          if (!cron && !runAt) {
            return { success: false, output: "Must provide either cron (recurring) or runAt (one-shot)" };
          }
          const jobId = id ?? `job-${Date.now()}`;
          ctx.scheduler.addJob({
            id: jobId,
            cron,
            runAt,
            prompt,
            channel: "default",
            enabled: true,
          });
          return { success: true, output: `Created job ${jobId} (${cron ? "recurring" : `one-shot at ${runAt}`})` };
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
