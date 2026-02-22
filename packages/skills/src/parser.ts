import matter from "gray-matter";
import type { SkillMeta } from "@augure/types";

/** Parse a skill.md file content into SkillMeta + body */
export function parseSkillMd(content: string): { meta: SkillMeta; body: string } {
  const { data, content: body } = matter(content);
  const meta = validateSkillMeta(data);
  return { meta, body: body.trim() };
}

/** Serialize SkillMeta + body back to skill.md format */
export function serializeSkillMd(meta: SkillMeta, body: string): string {
  return matter.stringify(body, JSON.parse(JSON.stringify(meta)));
}

/** Validate raw frontmatter data as SkillMeta */
export function validateSkillMeta(raw: Record<string, unknown>): SkillMeta {
  // Validate required fields
  if (!raw.id || typeof raw.id !== "string") throw new Error("skill.md: missing or invalid 'id'");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id)) throw new Error(`skill.md: invalid id format '${raw.id}' (must be lowercase slug)`);
  if (!raw.name || typeof raw.name !== "string") throw new Error("skill.md: missing or invalid 'name'");

  const version = typeof raw.version === "number" ? raw.version : 1;
  if (!Number.isInteger(version) || version < 1) throw new Error("skill.md: 'version' must be a positive integer");

  const now = new Date().toISOString();
  const created = typeof raw.created === "string" ? raw.created : now;
  const updated = typeof raw.updated === "string" ? raw.updated : now;

  const status = typeof raw.status === "string" ? raw.status : "draft";
  const validStatuses = ["draft", "testing", "active", "paused", "broken"];
  if (!validStatuses.includes(status)) throw new Error(`skill.md: invalid status '${status}'`);

  // Validate trigger
  const trigger = raw.trigger as Record<string, unknown> | undefined;
  if (!trigger || typeof trigger !== "object") throw new Error("skill.md: missing 'trigger'");
  const triggerType = trigger.type as string;
  if (!["cron", "manual", "event"].includes(triggerType)) throw new Error(`skill.md: invalid trigger.type '${triggerType}'`);

  if (triggerType === "cron" && (!trigger.schedule || typeof trigger.schedule !== "string")) {
    throw new Error("skill.md: cron trigger requires 'schedule'");
  }

  const sandbox = typeof raw.sandbox === "boolean" ? raw.sandbox : true;
  const tools = Array.isArray(raw.tools) ? (raw.tools as string[]) : [];
  const tags = Array.isArray(raw.tags) ? (raw.tags as string[]) : [];

  return {
    id: raw.id as string,
    name: raw.name as string,
    version,
    created,
    updated,
    status: status as SkillMeta["status"],
    trigger: {
      type: triggerType as "cron" | "manual" | "event",
      schedule: trigger.schedule as string | undefined,
      channel: trigger.channel as string | undefined,
    },
    sandbox,
    tools,
    tags,
  };
}
