import { loadConfig } from "./config.js";
import { OpenRouterClient } from "./llm.js";
import { Agent } from "./agent.js";
import { TelegramChannel } from "@augure/channels";
import { ToolRegistry, memoryReadTool, memoryWriteTool } from "@augure/tools";
import { FileMemoryStore } from "@augure/memory";
import { CronScheduler } from "@augure/scheduler";
import { resolve } from "node:path";

const SYSTEM_PROMPT = `You are Augure, a personal AI assistant. You are proactive, helpful, and concise.
You speak the same language as the user. You have access to tools and persistent memory.
Always be direct and actionable.`;

export async function startAgent(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  console.log(`[augure] Loaded config: ${config.identity.name}`);

  const llm = new OpenRouterClient({
    apiKey: config.llm.default.apiKey,
    model: config.llm.default.model,
    maxTokens: config.llm.default.maxTokens,
  });

  const memoryPath = resolve(configPath, "..", config.memory.path);
  const memory = new FileMemoryStore(memoryPath);
  console.log(`[augure] Memory store: ${memoryPath}`);

  let memoryContent = "";
  try {
    if (await memory.exists("observations.md")) {
      memoryContent = await memory.read("observations.md");
    }
    if (await memory.exists("identity.md")) {
      memoryContent += "\n\n" + (await memory.read("identity.md"));
    }
  } catch {
    console.log("[augure] No existing memory found, starting fresh.");
  }

  const tools = new ToolRegistry();
  tools.register(memoryReadTool);
  tools.register(memoryWriteTool);

  const scheduler = new CronScheduler();
  for (const job of config.scheduler.jobs) {
    scheduler.addJob({ ...job, enabled: true });
  }

  const agent = new Agent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    memoryContent,
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

  scheduler.start();
  console.log(
    `[augure] Scheduler started with ${config.scheduler.jobs.length} jobs.`,
  );

  const shutdown = () => {
    console.log("\n[augure] Shutting down...");
    scheduler.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const configPath = process.argv[2] ?? "./config/augure.json5";
startAgent(configPath).catch((err) => {
  console.error("[augure] Fatal error:", err);
  process.exit(1);
});
