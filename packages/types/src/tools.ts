import type {
  IdentityConfig,
  LLMConfig,
  ChannelsConfig,
  MemoryConfig,
  SchedulerConfig,
  SandboxConfig,
  ToolsConfig,
  SecurityConfig,
  AuditConfig,
  PersonaConfig,
  UpdatesConfig,
  CodeModeConfig,
} from "./config.js";
import type { SkillsConfig } from "./skills.js";
import type { MemoryStore } from "./memory.js";
import type { Scheduler } from "./scheduler.js";
import type { ContainerPool } from "./sandbox.js";

export interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: Artifact[];
}

export interface Artifact {
  type: "file" | "image" | "json";
  name: string;
  content: string;
}

export interface NativeTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: unknown, ctx: ToolContext) => Promise<ToolResult>;
  /** Return a warning string when this tool is not configured (appended to description for the LLM). Return null if configured. */
  configCheck?: (ctx: ToolContext) => string | null;
}

export interface ToolContext {
  config: AppConfig;
  memory: MemoryStore;
  scheduler: Scheduler;
  pool?: ContainerPool;
}

export interface AppConfig {
  identity: IdentityConfig;
  llm: LLMConfig;
  channels: ChannelsConfig;
  memory: MemoryConfig;
  scheduler: SchedulerConfig;
  sandbox: SandboxConfig;
  tools: ToolsConfig;
  security: SecurityConfig;
  skills?: SkillsConfig;
  audit?: AuditConfig;
  persona?: PersonaConfig;
  updates?: UpdatesConfig;
  codeMode?: CodeModeConfig;
}
