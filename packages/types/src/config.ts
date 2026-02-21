export interface IdentityConfig {
  name: string;
  personality: string;
}

export interface LLMModelConfig {
  provider: "openrouter" | "anthropic" | "openai";
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface LLMConfig {
  default: LLMModelConfig;
  reasoning?: Partial<LLMModelConfig>;
  ingestion?: Partial<LLMModelConfig>;
  monitoring?: Partial<LLMModelConfig>;
  coding?: Partial<LLMModelConfig>;
}

export interface ChannelsConfig {
  telegram?: {
    enabled: boolean;
    botToken: string;
    allowedUsers: number[];
  };
  whatsapp?: {
    enabled: boolean;
  };
  web?: {
    enabled: boolean;
    port: number;
  };
}

export interface MemoryConfig {
  path: string;
  autoIngest: boolean;
  maxRetrievalTokens: number;
}

export interface SchedulerJobConfig {
  id: string;
  cron: string;
  prompt: string;
  channel: string;
}

export interface SchedulerConfig {
  heartbeatInterval: string;
  jobs: SchedulerJobConfig[];
}

export interface SandboxConfig {
  runtime: "docker";
  defaults: {
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
}

export interface ToolsConfig {
  webSearch?: {
    provider: "tavily" | "searxng";
    apiKey: string;
  };
  email?: {
    imap: { host: string; port: number; user: string; password: string };
    smtp: { host: string; port: number; user: string; password: string };
  };
  github?: {
    token: string;
  };
}

export interface SecurityConfig {
  sandboxOnly: boolean;
  allowedHosts: string[];
  maxConcurrentSandboxes: number;
}
