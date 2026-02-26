import type { BrowserConfig } from "./browser.js";

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
    rejectMessage?: string;
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
  cron?: string;
  runAt?: string;
  prompt: string;
  channel: string;
}

export interface SchedulerConfig {
  heartbeatInterval: string;
  jobs: SchedulerJobConfig[];
}

export interface SandboxConfig {
  runtime: "docker";
  image?: string;
  defaults: {
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
  codeAgent?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

export interface WebSearchConfig {
  provider: "tavily" | "exa" | "searxng";
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
}

export interface HttpPreset {
  baseUrl: string;
  headers: Record<string, string>;
}

export interface HttpConfig {
  defaultHeaders?: Record<string, string>;
  presets?: Record<string, HttpPreset>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface ToolsConfig {
  webSearch?: WebSearchConfig;
  http?: HttpConfig;
  email?: {
    imap: { host: string; port: number; user: string; password: string };
    smtp: { host: string; port: number; user: string; password: string };
  };
  github?: {
    token: string;
  };
  browser?: BrowserConfig;
}

export interface SecurityConfig {
  sandboxOnly: boolean;
  allowedHosts: string[];
  maxConcurrentSandboxes: number;
}

export interface AuditConfig {
  path: string;
  enabled: boolean;
}

export interface PersonaConfig {
  path: string;
}

export interface UpdatesConfig {
  skills?: {
    enabled: boolean;
    checkInterval: string;
  };
  cli?: {
    enabled: boolean;
    checkInterval: string;
    notifyChannel: string;
  };
}

export interface CodeModeConfig {
  runtime: "vm" | "docker" | "auto";
  /** Execution timeout in seconds */
  timeout: number;
  /** Memory limit in megabytes (VM executor only) */
  memoryLimit: number;
}

export interface ApprovalConfig {
  enabled: boolean;
  /** Timeout in milliseconds before auto-rejecting. Default: 120_000 */
  timeoutMs?: number;
}

export interface McpConfig {
  enabled: boolean;
  /** HTTP port for MCP server. Default: 3100 */
  port?: number;
}
