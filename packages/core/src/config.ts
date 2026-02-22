import { readFile } from "node:fs/promises";
import JSON5 from "json5";
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
        rejectMessage: z.string().optional(),
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
    image: z.string().min(1).optional(),
    defaults: z.object({
      timeout: z.number().int().positive(),
      memoryLimit: z.string().min(1),
      cpuLimit: z.string().min(1),
    }),
    codeAgent: z
      .object({
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
  }),
  tools: z.object({
    webSearch: z
      .object({
        provider: z.enum(["tavily", "exa", "searxng"]),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        maxResults: z.number().int().positive().optional(),
      })
      .optional(),
    http: z
      .object({
        defaultHeaders: z.record(z.string(), z.string()).optional(),
        presets: z
          .record(
            z.string(),
            z.object({
              baseUrl: z.string(),
              headers: z.record(z.string(), z.string()),
            }),
          )
          .optional(),
        timeoutMs: z.number().int().positive().optional(),
        maxResponseBytes: z.number().int().positive().optional(),
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
  skills: z
    .object({
      path: z.string().min(1).default("./skills"),
      maxFailures: z.number().int().positive().default(3),
      autoSuggest: z.boolean().default(true),
      hub: z
        .object({
          repo: z.string().min(1),
          branch: z.string().min(1).default("main"),
        })
        .optional(),
    })
    .optional(),
  audit: z
    .object({
      path: z.string().min(1).default("./logs"),
      enabled: z.boolean().default(true),
    })
    .optional(),
  persona: z
    .object({
      path: z.string().min(1).default("./config/personas"),
    })
    .optional(),
  updates: z
    .object({
      skills: z
        .object({
          enabled: z.boolean().default(true),
          checkInterval: z.string().min(1).default("6h"),
        })
        .optional(),
      cli: z
        .object({
          enabled: z.boolean().default(true),
          checkInterval: z.string().min(1).default("24h"),
          notifyChannel: z.string().min(1).default("telegram"),
        })
        .optional(),
    })
    .optional(),
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
  const parsed = JSON5.parse(interpolated);
  return AppConfigSchema.parse(parsed);
}
