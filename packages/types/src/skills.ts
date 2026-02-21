export type SkillStatus = "draft" | "testing" | "active" | "paused" | "broken";

export interface SkillMeta {
  id: string;
  name: string;
  version: number;
  created: string;
  updated: string;
  status: SkillStatus;
  trigger: {
    type: "cron" | "manual" | "event";
    schedule?: string;
    channel?: string;
  };
  sandbox: boolean;
  tools: string[];
  tags: string[];
}

export interface SkillRunResult {
  skillId: string;
  timestamp: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  tokens?: { input: number; output: number; cost: number };
}
