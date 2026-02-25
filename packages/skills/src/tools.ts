import type { NativeTool, ToolResult } from "@augure/types";
import type { SkillManager } from "./manager.js";
import type { SkillRunner } from "./runner.js";
import type { SkillGenerator } from "./generator.js";
import type { SkillHealer } from "./healer.js";
import type { SkillHub } from "./hub.js";

export interface SkillToolsDeps {
  manager: SkillManager;
  runner: SkillRunner;
  generator: SkillGenerator;
  healer: SkillHealer;
  hub?: SkillHub;
}

export function createSkillTools(deps: SkillToolsDeps): NativeTool[] {
  const { manager, runner, generator, healer, hub } = deps;

  const createSkillTool: NativeTool = {
    name: "create_skill",
    description: "Create a new skill from a natural language description. Generates code, tests it, and deploys if successful.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the skill should do" },
        trigger_type: { type: "string", enum: ["cron", "manual", "event"], description: "When the skill should run" },
        schedule: { type: "string", description: "Cron expression (required if trigger_type is cron)" },
        channel: { type: "string", description: "Channel to send results to" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
      },
      required: ["description", "trigger_type"],
    },
    execute: async (params: unknown): Promise<ToolResult> => {
      const p = params as {
        description: string;
        trigger_type: "cron" | "manual" | "event";
        schedule?: string;
        channel?: string;
        tags?: string[];
      };

      const result = await generator.generate({
        description: p.description,
        trigger: {
          type: p.trigger_type,
          schedule: p.schedule,
          channel: p.channel,
        },
        tags: p.tags,
      });

      if (!result.success || !result.skill) {
        return { success: false, output: `Failed to generate skill: ${result.error}` };
      }

      await manager.save(result.skill);
      return {
        success: true,
        output: `Skill "${result.skill.meta.name}" (${result.skill.meta.id}) created with status: ${result.skill.meta.status}`,
      };
    },
  };

  const listSkillsTool: NativeTool = {
    name: "list_skills",
    description: "List all skills with their status and trigger info",
    parameters: { type: "object", properties: {} },
    execute: async (): Promise<ToolResult> => {
      const skills = await manager.list();
      if (skills.length === 0) {
        return { success: true, output: "No skills installed." };
      }

      const lines = skills.map((s) => {
        const trigger = s.trigger.type === "cron" ? `cron(${s.trigger.schedule})` : s.trigger.type;
        return `- **${s.name}** (${s.id}) [${s.status}] trigger: ${trigger}`;
      });

      return { success: true, output: lines.join("\n") };
    },
  };

  const runSkillTool: NativeTool = {
    name: "run_skill",
    description: "Manually trigger a skill execution by ID",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The skill ID to run" },
      },
      required: ["id"],
    },
    execute: async (params: unknown): Promise<ToolResult> => {
      const { id } = params as { id: string };

      if (!(await manager.exists(id))) {
        return { success: false, output: `Skill "${id}" not found` };
      }

      const result = await runner.run(id);

      await healer.onRunComplete(result);

      if (result.success) {
        return { success: true, output: result.output ?? "Skill completed successfully" };
      }
      return { success: false, output: `Skill failed: ${result.error}` };
    },
  };

  const manageSkillTool: NativeTool = {
    name: "manage_skill",
    description: "Manage a skill: pause, resume, or delete it",
    riskLevel: "high",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The skill ID" },
        action: { type: "string", enum: ["pause", "resume", "delete"], description: "Action to perform" },
      },
      required: ["id", "action"],
    },
    execute: async (params: unknown): Promise<ToolResult> => {
      const { id, action } = params as { id: string; action: "pause" | "resume" | "delete" };

      if (!(await manager.exists(id))) {
        return { success: false, output: `Skill "${id}" not found` };
      }

      switch (action) {
        case "pause":
          await manager.updateStatus(id, "paused");
          return { success: true, output: `Skill "${id}" paused` };
        case "resume":
          await manager.updateStatus(id, "active");
          return { success: true, output: `Skill "${id}" resumed` };
        case "delete":
          await manager.delete(id);
          return { success: true, output: `Skill "${id}" deleted` };
        default:
          return { success: false, output: `Unknown action: ${action as string}` };
      }
    },
  };

  const installSkillTool: NativeTool = {
    name: "install_skill",
    description: "Install a curated skill from the Augure skills hub",
    parameters: {
      type: "object",
      properties: {
        skill_id: { type: "string", description: "The skill ID to install from the hub" },
      },
      required: ["skill_id"],
    },
    execute: async (params: unknown): Promise<ToolResult> => {
      const { skill_id } = params as { skill_id: string };

      if (!hub) {
        return { success: false, output: "Skills hub is not configured. Add hub.repo to your skills config." };
      }

      try {
        const skill = await hub.download(skill_id);
        await manager.save(skill);
        return {
          success: true,
          output: `Skill "${skill.meta.name}" (${skill.meta.id}) installed from hub`,
        };
      } catch (err) {
        return {
          success: false,
          output: `Failed to install skill: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };

  return [createSkillTool, listSkillsTool, runSkillTool, manageSkillTool, installSkillTool];
}
