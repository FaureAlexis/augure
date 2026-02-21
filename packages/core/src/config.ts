import { readFile } from "node:fs/promises";
import { parse as parseJSON5 } from "json5";
import { z } from "zod";
import type { AppConfig } from "@augure/types";

const LLMModelConfigSchema = z.object({
  provider: z.enum(["openrouter", "anthropic", "openai"]),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  maxTokens: z.number().int().positive(),
});

const LLMConfigSchema = z.object({
  default: LLMModelConfigSchema,
  reasoning: LLMModelConfigSchema.partial().optional(),
  ingestion: LLMModelConfigSchema.partial().optional(),
  monitoring: LLMModelConfigSchema.partial().optional(),
  coding: LLMModelConfigSchema.partial().optional(),
});

const AppConfigSchema = z.object({
  identity: z.object({
    name: z.string().min(1),
    personality: z.string().min(1),
  }),
  llm: LLMConfigSchema,
  channels: z.object({
    telegram: z
      .object({
        enabled: z.boolean(),
        botToken: z.string(),
        allowedUsers: z.array(z.number()),
      })
      .optional(),
    whatsapp: z.object({ enabled: z.boolean() }).optional(),
    web: z.object({ enabled: z.boolean(), port: z.number() }).optional(),
  }),
  memory: z.object({
    path: z.string().min(1),
    autoIngest: z.boolean(),
    maxRetrievalTokens: z.number().int().positive(),
  }),
  scheduler: z.object({
    heartbeatInterval: z.string().min(1),
    jobs: z.array(
      z.object({
        id: z.string().min(1),
        cron: z.string().min(1),
        prompt: z.string().min(1),
        channel: z.string().min(1),
      }),
    ),
  }),
  sandbox: z.object({
    runtime: z.literal("docker"),
    defaults: z.object({
      timeout: z.number().int().positive(),
      memoryLimit: z.string().min(1),
      cpuLimit: z.string().min(1),
    }),
  }),
  tools: z.object({
    webSearch: z
      .object({
        provider: z.enum(["tavily", "searxng"]),
        apiKey: z.string(),
      })
      .optional(),
    email: z
      .object({
        imap: z.object({
          host: z.string(),
          port: z.number(),
          user: z.string(),
          password: z.string(),
        }),
        smtp: z.object({
          host: z.string(),
          port: z.number(),
          user: z.string(),
          password: z.string(),
        }),
      })
      .optional(),
    github: z.object({ token: z.string() }).optional(),
  }),
  security: z.object({
    sandboxOnly: z.boolean(),
    allowedHosts: z.array(z.string()),
    maxConcurrentSandboxes: z.number().int().positive(),
  }),
});

function interpolateEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new Error(`Missing environment variable: ${varName}`);
    }
    return value;
  });
}

export async function loadConfig(path: string): Promise<AppConfig> {
  const raw = await readFile(path, "utf-8");
  const interpolated = interpolateEnvVars(raw);
  const parsed = parseJSON5(interpolated);
  return AppConfigSchema.parse(parsed);
}
