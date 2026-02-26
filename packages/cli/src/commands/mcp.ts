import { defineCommand } from "citty";
import { resolve, dirname, join } from "node:path";
import { loadConfig, createLogger, createMcpServer } from "@augure/core";
import { PersonaResolver } from "@augure/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
import { FileMemoryStore } from "@augure/memory";
import { CronScheduler, JobStore } from "@augure/scheduler";

export const mcpCommand = defineCommand({
  meta: {
    name: "mcp",
    description: "Start MCP server (stdio transport)",
  },
  args: {
    config: {
      type: "string",
      description: "Path to config file",
      alias: "c",
      default: "./augure.json5",
    },
    env: {
      type: "string",
      description: "Path to .env file",
      alias: "e",
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const log = createLogger({ level: "info" });

    // Load .env
    const envPath = args.env
      ? resolve(args.env)
      : join(dirname(configPath), ".env");
    try {
      process.loadEnvFile(envPath);
    } catch {
      // .env not required
    }

    const config = await loadConfig(configPath);

    // Set up tool registry
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

    // Register browser tool if configured
    if (config.tools?.browser) {
      const { BrowserSessionManager } = await import("@augure/browser");
      const browserLlm = {
        ...config.llm.default,
        ...config.llm.coding,
      };
      const browserManager = new BrowserSessionManager({
        config: config.tools.browser,
        llm: browserLlm,
        logger: log.child("browser"),
      });
      tools.register(createBrowserTool(browserManager));
    }

    const memoryPath = resolve(configPath, "..", config.memory.path);
    const memory = new FileMemoryStore(memoryPath);

    const jobStorePath = resolve(configPath, "..", "jobs.json");
    const jobStore = new JobStore(jobStorePath);
    const scheduler = new CronScheduler({ store: jobStore, logger: log.child("scheduler") });
    await scheduler.loadPersistedJobs();

    // Add config-defined jobs
    for (const job of config.scheduler.jobs) {
      if (!scheduler.listJobs().some((j) => j.id === job.id)) {
        scheduler.addJob({ ...job, enabled: true });
      }
    }

    // Register skill tools if configured
    if (config.skills) {
      const { SkillManager, SkillGenerator, SkillRunner, SkillTester, SkillHealer, SkillHub, createSkillTools } = await import("@augure/skills");
      const { DockerContainerPool } = await import("@augure/sandbox");
      const { default: Dockerode } = await import("dockerode");
      const { OpenRouterClient } = await import("@augure/core");

      const skillsPath = resolve(configPath, "..", config.skills.path);
      const codingLLM = new OpenRouterClient({
        apiKey: config.llm.coding?.apiKey ?? config.llm.default.apiKey,
        model: config.llm.coding?.model ?? config.llm.default.model,
        maxTokens: config.llm.coding?.maxTokens ?? config.llm.default.maxTokens,
        logger: log.child("llm"),
      });

      const docker = new Dockerode();
      const pool = new DockerContainerPool(docker, {
        image: config.sandbox.image ?? "augure-sandbox:latest",
        maxTotal: config.security.maxConcurrentSandboxes,
        logger: log.child("sandbox"),
      });

      const skillManager = new SkillManager(skillsPath);
      const skillGenerator = new SkillGenerator(codingLLM);
      const skillRunner = new SkillRunner({ pool, manager: skillManager, defaults: config.sandbox.defaults });
      const skillTester = new SkillTester({ pool, defaults: config.sandbox.defaults });
      const skillHealer = new SkillHealer({
        manager: skillManager,
        generator: skillGenerator,
        tester: skillTester,
        maxAttempts: config.skills.maxFailures,
        skillsPath,
      });

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

      tools.setContext({ config, memory, scheduler, pool });
    } else {
      tools.setContext({ config, memory, scheduler });
    }

    // Persona resolver
    let personaResolver: PersonaResolver | undefined;
    if (config.persona) {
      const personaPath = resolve(configPath, "..", config.persona.path);
      personaResolver = new PersonaResolver(personaPath);
      await personaResolver.loadAll();
    }

    // Create and start MCP server
    const server = createMcpServer({
      tools,
      memory,
      scheduler,
      personaResolver,
      logger: log.child("mcp"),
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Keep alive — stdio transport handles the event loop
    log.info("MCP server running on stdio");
  },
});
