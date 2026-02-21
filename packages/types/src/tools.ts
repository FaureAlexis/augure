import type {
  IdentityConfig,
  LLMConfig,
  ChannelsConfig,
  MemoryConfig,
  SchedulerConfig,
  SandboxConfig,
  ToolsConfig,
  SecurityConfig,
} from "./config.js";

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
}

export interface ToolContext {
  config: AppConfig;
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
}
