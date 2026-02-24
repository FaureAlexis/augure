import type { Logger } from "@augure/types";
import { loadConfig } from "./config.js";
import { OpenRouterClient } from "./llm.js";
import { Agent } from "./agent.js";
import { FileAuditLogger, NullAuditLogger } from "./audit.js";
import { handleCommand } from "./commands.js";
import { PersonaResolver } from "./persona.js";
import { ContextGuard } from "./context-guard.js";
import { createLogger } from "./logger.js";
import { TelegramChannel } from "@augure/channels";
import {
  ToolRegistry,
  memoryReadTool,
  memoryWriteTool,
  scheduleTool,
  datetimeTool,
  webSearchTool,
  httpTool,
  emailTool,
  sandboxExecTool,
  opencodeTool,
  githubTool,
  createBrowserTool,
} from "@augure/tools";
import { BrowserSessionManager } from "@augure/browser";
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
import {
  VmExecutor,
  DockerExecutor,
  AutoExecutor,
} from "@augure/code-mode";
import type { CodeModeExecutor } from "@augure/code-mode";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { VersionChecker } from "./version-checker.js";

const BASE_SYSTEM_PROMPT = `You are Augure, a personal AI assistant. You are proactive, helpful, and concise.
You speak the same language as the user. You have access to tools and persistent memory.
Always be direct and actionable.

## Your capabilities

You have access to tools that let you interact with the outside world. Use the datetime tool when the user needs precise time information beyond what is shown in the current date above. Use memory tools to remember and recall information across conversations. Use the schedule tool to create recurring or one-shot tasks.

If a tool is marked as [NOT CONFIGURED], let the user know it needs to be set up first and share the documentation link from the tool description.`;

const SKILLS_PROMPT = `
## Skills

You can create and manage "skills" — autonomous code units that run in isolated Docker containers. Skills are powerful: they let you automate tasks, run on a schedule, and self-heal when they break.

- Use skill_list to see existing skills and their status
- Use skill_generate to create a new skill from a natural language description
- Use skill_run to execute a skill manually
- Use skill_heal to fix a broken skill
- Use skill_install to install a skill from the hub

When a user asks to automate a recurring task (e.g. "check this every morning", "send me a summary daily"), suggest creating a skill with a cron trigger. Skills can also be triggered manually or by events.`;

export interface StartAgentOptions {
  debug?: boolean;
}

function resolveLLMClient(
  config: import("@augure/types").LLMConfig,
  usage: "default" | "ingestion" | "monitoring" | "reasoning" | "coding",
  logger: Logger,
): OpenRouterClient {
  const override = usage !== "default"
    ? (config[usage] as { apiKey?: string; model?: string; maxTokens?: number } | undefined)
    : undefined;
  return new OpenRouterClient({
    apiKey: override?.apiKey ?? config.default.apiKey,
    model: override?.model ?? config.default.model,
    maxTokens: override?.maxTokens ?? config.default.maxTokens,
    logger: logger.child("llm"),
  });
}

export async function startAgent(
  configPath: string,
  opts?: StartAgentOptions,
): Promise<void> {
  const log = createLogger({ level: opts?.debug ? "debug" : "info" });

  const config = await loadConfig(configPath);
  log.info(`Loaded config: ${config.identity.name}`);
  log.debug(`Config path: ${configPath}`);

  let telegram: TelegramChannel | undefined;

  const llm = resolveLLMClient(config.llm, "default", log);
  const ingestionLLM = resolveLLMClient(config.llm, "ingestion", log);
  const monitoringLLM = resolveLLMClient(config.llm, "monitoring", log);

  const memoryPath = resolve(configPath, "..", config.memory.path);
  const memory = new FileMemoryStore(memoryPath);
  log.info(`Memory store: ${memoryPath}`);

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
  tools.register(datetimeTool);
  tools.register(webSearchTool);
  tools.register(httpTool);
  tools.register(emailTool);
  tools.register(sandboxExecTool);
  tools.register(opencodeTool);
  tools.register(githubTool);

  // Browser tool (optional)
  let browserManager: BrowserSessionManager | undefined;
  if (config.tools?.browser) {
    const browserLlm = config.llm.coding ?? config.llm.default;
    browserManager = new BrowserSessionManager({
      config: config.tools.browser,
      llm: {
        provider: browserLlm.provider ?? config.llm.default.provider,
        apiKey: browserLlm.apiKey ?? config.llm.default.apiKey,
        model: browserLlm.model ?? config.llm.default.model,
        maxTokens: browserLlm.maxTokens ?? config.llm.default.maxTokens,
      },
      ttlMs: 120_000,
      logger: log.child("browser"),
    });
    tools.register(createBrowserTool(browserManager));
    log.info("Browser tool registered", { provider: config.tools.browser.provider });
  }

  const jobStorePath = resolve(configPath, "..", "jobs.json");
  const jobStore = new JobStore(jobStorePath);
  const scheduler = new CronScheduler({ store: jobStore, logger: log.child("scheduler") });

  // Load persisted jobs from disk
  await scheduler.loadPersistedJobs();
  log.info(`Loaded ${scheduler.listJobs().length} persisted jobs`);

  // Add config-defined jobs (skip if already persisted)
  for (const job of config.scheduler.jobs) {
    if (!scheduler.listJobs().some((j) => j.id === job.id)) {
      scheduler.addJob({ ...job, enabled: true });
    }
  }

  // Create container pool (auto-build image if missing)
  const docker = new Dockerode();
  const sandboxImage = config.sandbox.image ?? "augure-sandbox:latest";
  const sandboxLog = log.child("sandbox");
  await ensureImage(docker, sandboxImage, sandboxLog);
  const pool = new DockerContainerPool(docker, {
    image: sandboxImage,
    maxTotal: config.security.maxConcurrentSandboxes,
    logger: sandboxLog,
  });
  log.info(`Container pool: max=${config.security.maxConcurrentSandboxes}`);

  // Skills setup (optional — only if config.skills is present)
  let skillManagerRef: { updateStatus(id: string, status: string): Promise<void> } | undefined;
  let skillUpdater: SkillUpdater | undefined;
  if (config.skills) {
    const skillsPath = resolve(configPath, "..", config.skills.path);
    const codingLLM = resolveLLMClient(config.llm, "coding", log);

    const skillManager = new SkillManager(skillsPath);
    const skillGenerator = new SkillGenerator(codingLLM);
    const skillRunner = new SkillRunner({
      pool,
      manager: skillManager,
      defaults: config.sandbox.defaults,
      browserManager,
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
          log.info(`Skills updated: ${updated.map((r) => `${r.skillId} (v${r.fromVersion}→v${r.toVersion})`).join(", ")}`);
        }
        if (failed.length > 0) {
          log.warn(`Skill updates failed: ${failed.map((r) => `${r.skillId}: ${r.error}`).join(", ")}`);
        }
      } catch (err) {
        log.error("Skill update check failed:", err);
      }
    }

    skillManagerRef = skillManager;
    log.info(`Skills initialized: ${skillsPath}`);
  }

  tools.setContext({ config, memory, scheduler, pool });

  // Code Mode setup
  let codeModeExecutor: CodeModeExecutor | undefined;
  if (config.codeMode) {
    const cmConfig = config.codeMode;

    if (cmConfig.runtime === "vm") {
      codeModeExecutor = new VmExecutor(tools, {
        timeout: cmConfig.timeout * 1000, // VmExecutor expects ms
        memoryLimit: cmConfig.memoryLimit,
      });
    } else if (cmConfig.runtime === "docker") {
      codeModeExecutor = new DockerExecutor({
        registry: tools,
        pool,
        timeout: cmConfig.timeout, // DockerExecutor expects seconds
        memoryLimit: config.sandbox.defaults.memoryLimit,
        cpuLimit: config.sandbox.defaults.cpuLimit,
      });
    } else {
      // "auto" — VM with Docker fallback
      const vmExec = new VmExecutor(tools, {
        timeout: cmConfig.timeout * 1000,
        memoryLimit: cmConfig.memoryLimit,
      });
      const dockerExec = new DockerExecutor({
        registry: tools,
        pool,
        timeout: cmConfig.timeout,
        memoryLimit: config.sandbox.defaults.memoryLimit,
        cpuLimit: config.sandbox.defaults.cpuLimit,
      });
      codeModeExecutor = new AutoExecutor(vmExec, dockerExec);
    }

    log.info(`Code Mode enabled: runtime=${cmConfig.runtime}, timeout=${cmConfig.timeout}s`);
  }

  // Audit logger
  const auditConfig = config.audit ?? { path: "./logs", enabled: true };
  const auditPath = resolve(configPath, "..", auditConfig.path);
  const audit = auditConfig.enabled
    ? new FileAuditLogger(auditPath, log.child("audit"))
    : new NullAuditLogger();
  log.info(`Audit: ${auditConfig.enabled ? auditPath : "disabled"}`);

  // Persona resolver
  let personaResolver: PersonaResolver | undefined;
  if (config.persona) {
    const personaPath = resolve(configPath, "..", config.persona.path);
    personaResolver = new PersonaResolver(personaPath);
    await personaResolver.loadAll();
    log.info(`Personas: ${personaPath}`);
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
      log.warn(
        `Update available: v${versionResult.latestVersion} (current: v${versionResult.currentVersion}). Run: npm update -g augure`,
      );
    }
  }

  // Context guard — maxContextTokens is the model's context window,
  // reservedForOutput is the max output tokens from config
  const guard = new ContextGuard({
    maxContextTokens: 200_000,
    reservedForOutput: config.llm.default.maxTokens ?? 8_192,
  });

  const systemPrompt = config.skills
    ? BASE_SYSTEM_PROMPT + SKILLS_PROMPT
    : BASE_SYSTEM_PROMPT;

  const agent = new Agent({
    llm,
    tools,
    systemPrompt,
    memoryContent: "",
    retriever,
    ingester,
    audit,
    guard,
    modelName: config.llm.default.model,
    logger: log.child("agent"),
    codeModeExecutor,
  });

  if (config.channels.telegram?.enabled) {
    const telegramLog = log.child("telegram");
    telegram = new TelegramChannel({
      botToken: config.channels.telegram.botToken,
      allowedUsers: config.channels.telegram.allowedUsers,
      rejectMessage: config.channels.telegram.rejectMessage,
      logger: telegramLog,
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
      log.info(`Message from ${msg.userId}: ${msg.text}`);
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
        log.error("Error handling message:", err);
        await tg.send({
          channelType: "telegram",
          userId: msg.userId,
          text: "An error occurred while processing your message.",
        });
      }
    });

    await tg.start();
    log.info("Telegram bot started");
  }

  // Set up heartbeat
  const heartbeatIntervalMs = parseInterval(
    config.scheduler.heartbeatInterval,
  );
  const heartbeat = new Heartbeat({
    llm: monitoringLLM,
    memory,
    intervalMs: heartbeatIntervalMs,
    logger: log.child("heartbeat"),
    onAction: async (action) => {
      log.info(`Heartbeat action: ${action}`);
      const response = await agent.handleMessage({
        id: `heartbeat-${Date.now()}`,
        channelType: "system",
        userId: "system",
        text: `[Heartbeat] ${action}`,
        timestamp: new Date(),
      });
      log.debug(`Heartbeat response: ${response.slice(0, 200)}`);
    },
  });

  scheduler.onJobTrigger(async (job) => {
    log.info(`Job triggered: ${job.id}`);
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
    log.debug(`Job ${job.id} completed`);
  });

  scheduler.start();
  heartbeat.start();
  log.info(
    `Scheduler started: ${scheduler.listJobs().length} jobs, heartbeat every ${config.scheduler.heartbeatInterval}`,
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
            log.info(`Skill auto-updated: ${r.skillId} v${r.fromVersion}→v${r.toVersion}`);
          } else if (r.rolledBack) {
            log.warn(`Skill update rolled back: ${r.skillId} - ${r.error}`);
          }
        }
      } catch (err) {
        log.error("Periodic skill update check failed:", err);
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
        log.error("CLI version check failed:", err);
      }
    }, cliCheckMs));
  }

  const shutdown = async () => {
    log.info("Shutting down...");
    for (const timer of updateTimers) clearInterval(timer);
    heartbeat.stop();
    scheduler.stop();
    if (telegram) await telegram.stop();
    if (browserManager) await browserManager.closeAll();
    await pool.destroyAll();
    await audit.close();
    log.info("All containers destroyed");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
