import { loadConfig } from "./config.js";
import { OpenRouterClient } from "./llm.js";
import { Agent } from "./agent.js";
import { FileAuditLogger, NullAuditLogger } from "./audit.js";
import { handleCommand } from "./commands.js";
import { PersonaResolver } from "./persona.js";
import { ContextGuard } from "./context-guard.js";
import { TelegramChannel } from "@augure/channels";
import {
  ToolRegistry,
  memoryReadTool,
  memoryWriteTool,
  scheduleTool,
  webSearchTool,
  httpTool,
  sandboxExecTool,
  opencodeTool,
} from "@augure/tools";
import Dockerode from "dockerode";
import { DockerContainerPool, ensureImage } from "@augure/sandbox";
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
import {
  SkillManager,
  SkillGenerator,
  SkillRunner,
  SkillTester,
  SkillHealer,
  SkillSchedulerBridge,
  SkillHub,
  SkillUpdater,
  createSkillTools,
  installBuiltins,
} from "@augure/skills";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { VersionChecker } from "./version-checker.js";

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

  let telegram: TelegramChannel | undefined;

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
  tools.register(webSearchTool);
  tools.register(httpTool);
  tools.register(sandboxExecTool);
  tools.register(opencodeTool);

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

  // Create container pool (auto-build image if missing)
  const docker = new Dockerode();
  const sandboxImage = config.sandbox.image ?? "augure-sandbox:latest";
  await ensureImage(docker, sandboxImage);
  const pool = new DockerContainerPool(docker, {
    image: sandboxImage,
    maxTotal: config.security.maxConcurrentSandboxes,
  });
  console.log(`[augure] Container pool created (max: ${config.security.maxConcurrentSandboxes})`);

  // Skills setup (optional — only if config.skills is present)
  let skillManagerRef: { updateStatus(id: string, status: string): Promise<void> } | undefined;
  let skillUpdater: SkillUpdater | undefined;
  if (config.skills) {
    const skillsPath = resolve(configPath, "..", config.skills.path);
    const codingLLM = resolveLLMClient(config.llm, "coding");

    const skillManager = new SkillManager(skillsPath);
    const skillGenerator = new SkillGenerator(codingLLM);
    const skillRunner = new SkillRunner({
      pool,
      manager: skillManager,
      defaults: config.sandbox.defaults,
    });
    const skillTester = new SkillTester({
      pool,
      defaults: config.sandbox.defaults,
    });
    const skillHealer = new SkillHealer({
      manager: skillManager,
      generator: skillGenerator,
      tester: skillTester,
      maxAttempts: config.skills.maxFailures,
      skillsPath,
    });

    // Install built-in skills (idempotent)
    await installBuiltins(skillManager);

    // Register skill tools
    const hub = config.skills.hub
      ? new SkillHub({ repo: config.skills.hub.repo, branch: config.skills.hub.branch ?? "main" })
      : undefined;
    const skillTools = createSkillTools({
      manager: skillManager,
      runner: skillRunner,
      generator: skillGenerator,
      healer: skillHealer,
      hub,
    });
    for (const tool of skillTools) {
      tools.register(tool);
    }

    // Sync cron-triggered skills with scheduler
    const skillBridge = new SkillSchedulerBridge(scheduler, skillManager);
    await skillBridge.syncAll();

    // Skill auto-update
    if (hub && config.updates?.skills?.enabled !== false) {
      skillUpdater = new SkillUpdater({
        manager: skillManager,
        hub,
        tester: skillTester,
      });

      try {
        const updateResults = await skillUpdater.checkAndApply();
        const updated = updateResults.filter((r) => r.success);
        const failed = updateResults.filter((r) => !r.success);
        if (updated.length > 0) {
          console.log(`[augure] Skills updated: ${updated.map((r) => `${r.skillId} (v${r.fromVersion}→v${r.toVersion})`).join(", ")}`);
        }
        if (failed.length > 0) {
          console.log(`[augure] Skill updates failed: ${failed.map((r) => `${r.skillId}: ${r.error}`).join(", ")}`);
        }
      } catch (err) {
        console.error("[augure] Skill update check failed:", err);
      }
    }

    skillManagerRef = skillManager;
    console.log(`[augure] Skills system initialized at ${skillsPath}`);
  }

  tools.setContext({ config, memory, scheduler, pool });

  // Audit logger
  const auditConfig = config.audit ?? { path: "./logs", enabled: true };
  const auditPath = resolve(configPath, "..", auditConfig.path);
  const audit = auditConfig.enabled
    ? new FileAuditLogger(auditPath)
    : new NullAuditLogger();
  console.log(`[augure] Audit logger: ${auditConfig.enabled ? auditPath : "disabled"}`);

  // Persona resolver
  let personaResolver: PersonaResolver | undefined;
  if (config.persona) {
    const personaPath = resolve(configPath, "..", config.persona.path);
    personaResolver = new PersonaResolver(personaPath);
    await personaResolver.loadAll();
    console.log(`[augure] Personas loaded from ${personaPath}`);
  }

  // Resolve CLI version (used for startup check + periodic notification)
  let cliVersion: string | undefined;
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("augure/package.json") as { version: string };
    cliVersion = pkg.version;
  } catch {
    // augure package not resolvable (e.g. standalone @augure/core install)
  }

  // CLI version check at startup
  if (cliVersion && config.updates?.cli?.enabled !== false) {
    const versionChecker = new VersionChecker({
      currentVersion: cliVersion,
      packageName: "augure",
    });
    const versionResult = await versionChecker.check();
    if (versionResult.updateAvailable) {
      console.log(
        `[augure] Update available: v${versionResult.latestVersion} (current: v${versionResult.currentVersion}). Run: npm update -g augure`,
      );
    }
  }

  // Context guard — maxContextTokens is the model's context window,
  // reservedForOutput is the max output tokens from config
  const guard = new ContextGuard({
    maxContextTokens: 200_000,
    reservedForOutput: config.llm.default.maxTokens ?? 8_192,
  });

  const agent = new Agent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    memoryContent: "",
    retriever,
    ingester,
    audit,
    guard,
    modelName: config.llm.default.model,
  });

  if (config.channels.telegram?.enabled) {
    telegram = new TelegramChannel({
      botToken: config.channels.telegram.botToken,
      allowedUsers: config.channels.telegram.allowedUsers,
      rejectMessage: config.channels.telegram.rejectMessage,
    });
    const tg = telegram;

    // Command context for kill switch
    const commandCtx = {
      scheduler,
      pool,
      agent,
      skillManager: skillManagerRef,
    };

    tg.onMessage(async (msg) => {
      console.log(`[augure] Message from ${msg.userId}: ${msg.text}`);
      try {
        // Intercept commands before agent processing
        const cmdResult = await handleCommand(msg.text, commandCtx);
        if (cmdResult.handled) {
          await tg.send({
            channelType: "telegram",
            userId: msg.userId,
            text: cmdResult.response ?? "OK",
            replyTo: msg.id,
          });
          return;
        }

        // Resolve persona dynamically
        if (personaResolver) {
          agent.setPersona(personaResolver.resolve(msg.text));
        }

        const response = await agent.handleMessage(msg);
        await tg.send({
          channelType: "telegram",
          userId: msg.userId,
          text: response,
          replyTo: msg.id,
        });
      } catch (err) {
        console.error("[augure] Error handling message:", err);
        await tg.send({
          channelType: "telegram",
          userId: msg.userId,
          text: "An error occurred while processing your message.",
        });
      }
    });

    await tg.start();
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

  scheduler.onJobTrigger(async (job) => {
    console.log(`[augure] Job triggered: ${job.id}`);
    const response = await agent.handleMessage({
      id: `job-${job.id}-${Date.now()}`,
      channelType: "system",
      userId: "system",
      text: job.prompt,
      timestamp: new Date(),
    });
    // Send response to Telegram if configured
    if (telegram && config.channels.telegram?.enabled) {
      const userId = config.channels.telegram.allowedUsers[0];
      if (userId !== undefined) {
        await telegram.send({
          channelType: "telegram",
          userId: String(userId),
          text: response,
        });
      }
    }
    console.log(`[augure] Job ${job.id} completed`);
  });

  scheduler.start();
  heartbeat.start();
  console.log(
    `[augure] Scheduler started with ${scheduler.listJobs().length} jobs. Heartbeat every ${config.scheduler.heartbeatInterval}.`,
  );

  // Periodic update timers (stored for cleanup on shutdown)
  const updateTimers: ReturnType<typeof setInterval>[] = [];

  // Periodic skill update checks
  if (skillUpdater && config.updates?.skills?.checkInterval) {
    const su = skillUpdater;
    const skillCheckMs = parseInterval(config.updates.skills.checkInterval);
    updateTimers.push(setInterval(async () => {
      try {
        const results = await su.checkAndApply();
        for (const r of results) {
          if (r.success) {
            console.log(`[augure] Skill auto-updated: ${r.skillId} v${r.fromVersion}→v${r.toVersion}`);
          } else if (r.rolledBack) {
            console.log(`[augure] Skill update rolled back: ${r.skillId} - ${r.error}`);
          }
        }
      } catch (err) {
        console.error("[augure] Periodic skill update check failed:", err);
      }
    }, skillCheckMs));
  }

  // Periodic CLI version check with Telegram notification
  if (cliVersion && config.updates?.cli?.enabled !== false && config.channels.telegram?.enabled) {
    const cliCheckMs = parseInterval(config.updates?.cli?.checkInterval ?? "24h");
    const versionChecker = new VersionChecker({
      currentVersion: cliVersion,
      packageName: "augure",
    });

    updateTimers.push(setInterval(async () => {
      try {
        const result = await versionChecker.check();
        if (result.updateAvailable && telegram) {
          const userId = config.channels.telegram?.allowedUsers[0];
          if (userId !== undefined) {
            await telegram.send({
              channelType: "telegram",
              userId: String(userId),
              text: `Update available: Augure v${result.latestVersion} (current: v${result.currentVersion}).\nRun: \`npm update -g augure\``,
            });
          }
        }
      } catch (err) {
        console.error("[augure] CLI version check failed:", err);
      }
    }, cliCheckMs));
  }

  const shutdown = async () => {
    console.log("\n[augure] Shutting down...");
    for (const timer of updateTimers) clearInterval(timer);
    heartbeat.stop();
    scheduler.stop();
    if (telegram) await telegram.stop();
    await pool.destroyAll();
    await audit.close();
    console.log("[augure] All containers destroyed");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
