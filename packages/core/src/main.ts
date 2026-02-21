import { loadConfig } from "./config.js";
import { OpenRouterClient } from "./llm.js";
import { Agent } from "./agent.js";
import { TelegramChannel } from "@augure/channels";
import {
  ToolRegistry,
  memoryReadTool,
  memoryWriteTool,
  scheduleTool,
} from "@augure/tools";
import {
  FileMemoryStore,
  MemoryIngester,
  MemoryRetriever,
} from "@augure/memory";
import {
  CronScheduler,
  JobStore,
  Heartbeat,
  parseInterval,
} from "@augure/scheduler";
import { resolve } from "node:path";

const SYSTEM_PROMPT = `You are Augure, a personal AI assistant. You are proactive, helpful, and concise.
You speak the same language as the user. You have access to tools and persistent memory.
Always be direct and actionable.`;

function resolveLLMClient(
  config: import("@augure/types").LLMConfig,
  usage: "default" | "ingestion" | "monitoring" | "reasoning" | "coding",
): OpenRouterClient {
  const override = usage !== "default"
    ? (config[usage] as { apiKey?: string; model?: string; maxTokens?: number } | undefined)
    : undefined;
  return new OpenRouterClient({
    apiKey: override?.apiKey ?? config.default.apiKey,
    model: override?.model ?? config.default.model,
    maxTokens: override?.maxTokens ?? config.default.maxTokens,
  });
}

export async function startAgent(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  console.log(`[augure] Loaded config: ${config.identity.name}`);

  const llm = resolveLLMClient(config.llm, "default");
  const ingestionLLM = resolveLLMClient(config.llm, "ingestion");
  const monitoringLLM = resolveLLMClient(config.llm, "monitoring");

  const memoryPath = resolve(configPath, "..", config.memory.path);
  const memory = new FileMemoryStore(memoryPath);
  console.log(`[augure] Memory store: ${memoryPath}`);

  const retriever = new MemoryRetriever(memory, {
    maxTokens: config.memory.maxRetrievalTokens,
  });

  const ingester = config.memory.autoIngest
    ? new MemoryIngester(ingestionLLM, memory)
    : undefined;

  const tools = new ToolRegistry();
  tools.register(memoryReadTool);
  tools.register(memoryWriteTool);
  tools.register(scheduleTool);

  const jobStorePath = resolve(configPath, "..", "jobs.json");
  const jobStore = new JobStore(jobStorePath);
  const scheduler = new CronScheduler(jobStore);

  // Load persisted jobs from disk
  await scheduler.loadPersistedJobs();
  console.log(`[augure] Loaded ${scheduler.listJobs().length} persisted jobs`);

  // Add config-defined jobs (skip if already persisted)
  for (const job of config.scheduler.jobs) {
    if (!scheduler.listJobs().some((j) => j.id === job.id)) {
      scheduler.addJob({ ...job, enabled: true });
    }
  }

  tools.setContext({ config, memory, scheduler });

  const agent = new Agent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    memoryContent: "",
    retriever,
    ingester,
  });

  if (config.channels.telegram?.enabled) {
    const telegram = new TelegramChannel({
      botToken: config.channels.telegram.botToken,
      allowedUsers: config.channels.telegram.allowedUsers,
    });

    telegram.onMessage(async (msg) => {
      console.log(`[augure] Message from ${msg.userId}: ${msg.text}`);
      try {
        const response = await agent.handleMessage(msg);
        await telegram.send({
          channelType: "telegram",
          userId: msg.userId,
          text: response,
          replyTo: msg.id,
        });
      } catch (err) {
        console.error("[augure] Error handling message:", err);
        await telegram.send({
          channelType: "telegram",
          userId: msg.userId,
          text: "An error occurred while processing your message.",
        });
      }
    });

    await telegram.start();
    console.log("[augure] Telegram bot started. Waiting for messages...");
  }

  // Set up heartbeat
  const heartbeatIntervalMs = parseInterval(
    config.scheduler.heartbeatInterval,
  );
  const heartbeat = new Heartbeat({
    llm: monitoringLLM,
    memory,
    intervalMs: heartbeatIntervalMs,
    onAction: async (action) => {
      console.log(`[augure] Heartbeat action: ${action}`);
      const response = await agent.handleMessage({
        id: `heartbeat-${Date.now()}`,
        channelType: "system",
        userId: "system",
        text: `[Heartbeat] ${action}`,
        timestamp: new Date(),
      });
      console.log(`[augure] Heartbeat response: ${response}`);
    },
  });

  scheduler.start();
  heartbeat.start();
  console.log(
    `[augure] Scheduler started with ${scheduler.listJobs().length} jobs. Heartbeat every ${config.scheduler.heartbeatInterval}.`,
  );

  const shutdown = () => {
    console.log("\n[augure] Shutting down...");
    heartbeat.stop();
    scheduler.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
