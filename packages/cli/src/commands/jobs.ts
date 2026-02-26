import { defineCommand } from "citty";
import { resolve } from "node:path";
import { validate } from "node-cron";
import { loadConfig } from "@augure/core";
import { JobStore, CronScheduler } from "@augure/scheduler";
import { prefix, ok, err, dim, bold, cyan } from "../colors.js";

const configArg = {
  type: "string" as const,
  description: "Path to config file",
  alias: "c",
  default: "./augure.json5",
};

async function loadJobs(configPath: string) {
  const config = await loadConfig(configPath);
  const jobStorePath = resolve(configPath, "..", "jobs.json");
  const store = new JobStore(jobStorePath);
  const persisted = await store.load();

  // Merge with config-defined jobs (config jobs are always enabled)
  const allJobs = [...persisted];
  const persistedIds = new Set(persisted.map((j) => j.id));
  for (const cj of config.scheduler.jobs) {
    if (!persistedIds.has(cj.id)) {
      allJobs.push({ ...cj, enabled: true });
    }
  }

  return { config, store, jobs: allJobs, jobStorePath };
}

const listCommand = defineCommand({
  meta: { name: "list", description: "List all jobs" },
  args: { config: configArg },
  async run({ args }) {
    const configPath = resolve(args.config);
    const { jobs } = await loadJobs(configPath);

    if (jobs.length === 0) {
      console.log(`${prefix} ${dim("No jobs found.")}`);
      return;
    }

    console.log(bold(
      [
        "ID".padEnd(22),
        "TYPE".padEnd(10),
        "SCHEDULE".padEnd(22),
        "ENABLED".padEnd(9),
        "CHANNEL".padEnd(12),
        "LAST RUN",
      ].join(""),
    ));

    for (const j of jobs) {
      const type = j.cron ? "cron" : "one-shot";
      const schedule = j.cron ?? j.runAt ?? "";
      const enabledLabel = j.enabled ? "yes" : "no";
      const enabledFn = j.enabled ? ok : dim;
      const lastRun = j.lastRun ? dim(j.lastRun.slice(0, 19)) : dim("(pending)");
      console.log(
        [
          cyan(j.id.padEnd(22)),
          type.padEnd(10),
          schedule.slice(0, 20).padEnd(22),
          enabledFn(enabledLabel.padEnd(9)),
          (j.channel ?? "").padEnd(12),
          lastRun,
        ].join(""),
      );
    }
  },
});

const addCommand = defineCommand({
  meta: { name: "add", description: "Add a new job" },
  args: {
    config: configArg,
    id: { type: "string", description: "Job ID", required: true },
    cron: { type: "string", description: "Cron expression" },
    runAt: { type: "string", description: "ISO date for one-shot job" },
    prompt: { type: "string", description: "Prompt text", required: true },
    channel: { type: "string", description: "Channel to send response", default: "telegram" },
  },
  async run({ args }) {
    const configPath = resolve(args.config);

    if (!args.cron && !args.runAt) {
      console.error(`${prefix} ${err("Must provide either --cron or --runAt")}`);
      process.exit(1);
    }

    if (args.cron && !validate(args.cron)) {
      console.error(`${prefix} ${err(`Invalid cron expression: ${args.cron}`)}`);
      process.exit(1);
    }

    if (args.runAt && isNaN(Date.parse(args.runAt))) {
      console.error(`${prefix} ${err(`Invalid date: ${args.runAt}`)}`);
      process.exit(1);
    }

    const jobStorePath = resolve(configPath, "..", "jobs.json");
    const store = new JobStore(jobStorePath);
    const jobs = await store.load();

    if (jobs.some((j) => j.id === args.id)) {
      console.error(`${prefix} ${err(`Job "${args.id}" already exists.`)}`);
      process.exit(1);
    }

    const job = {
      id: args.id,
      cron: args.cron,
      runAt: args.runAt,
      prompt: args.prompt,
      channel: args.channel,
      enabled: true,
    };

    jobs.push(job);
    await store.save(jobs);
    console.log(`${prefix} ${ok(`Job "${args.id}" added.`)}`);
  },
});

const removeCommand = defineCommand({
  meta: { name: "remove", description: "Remove a job" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Job ID", required: true },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const jobStorePath = resolve(configPath, "..", "jobs.json");
    const store = new JobStore(jobStorePath);
    const jobs = await store.load();

    const idx = jobs.findIndex((j) => j.id === args.id);
    if (idx === -1) {
      console.error(`${prefix} ${err(`Job "${args.id}" not found in persisted jobs.`)}`);
      process.exit(1);
    }

    jobs.splice(idx, 1);
    await store.save(jobs);
    console.log(`${prefix} ${ok(`Job "${args.id}" removed.`)}`);
  },
});

const runCommand = defineCommand({
  meta: { name: "run", description: "Run a job's prompt manually" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Job ID", required: true },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const { jobs, config } = await loadJobs(configPath);

    const job = jobs.find((j) => j.id === args.id);
    if (!job) {
      console.error(`${prefix} ${err(`Job "${args.id}" not found.`)}`);
      process.exit(1);
    }

    console.log(`${prefix} Running job ${cyan(args.id)}...`);
    console.log(`${prefix} Prompt: ${dim(job.prompt.slice(0, 100))}`);

    // Create a minimal agent to execute the prompt
    const { OpenRouterClient, createLogger } = await import("@augure/core");
    const { FileMemoryStore, MemoryRetriever } = await import("@augure/memory");
    const { ToolRegistry, datetimeTool, memoryReadTool, memoryWriteTool } = await import("@augure/tools");
    const { Agent, ContextGuard } = await import("@augure/core");

    const log = createLogger({ level: "info" });
    const llm = new OpenRouterClient({
      apiKey: config.llm.default.apiKey,
      model: config.llm.default.model,
      maxTokens: config.llm.default.maxTokens,
      logger: log.child("llm"),
    });

    const memoryPath = resolve(configPath, "..", config.memory.path);
    const memory = new FileMemoryStore(memoryPath);
    const retriever = new MemoryRetriever(memory, { maxTokens: config.memory.maxRetrievalTokens });
    const scheduler = new CronScheduler();

    const tools = new ToolRegistry();
    tools.register(datetimeTool);
    tools.register(memoryReadTool);
    tools.register(memoryWriteTool);
    tools.setContext({ config, memory, scheduler });

    const guard = new ContextGuard({
      maxContextTokens: 200_000,
      reservedForOutput: config.llm.default.maxTokens ?? 8_192,
    });

    const agent = new Agent({
      llm,
      tools,
      systemPrompt: `You are ${config.identity.name}. Execute the following job prompt and respond with the result.`,
      memoryContent: "",
      retriever,
      audit: { log: async () => {}, close: async () => {} },
      guard,
      modelName: config.llm.default.model,
      logger: log.child("agent"),
    });

    const response = await agent.handleMessage({
      id: `cli-job-${args.id}-${Date.now()}`,
      channelType: "system",
      userId: "cli",
      text: job.prompt,
      timestamp: new Date(),
    });

    console.log(`\n${bold("Response:")}\n${response}`);
  },
});

export const jobsCommand = defineCommand({
  meta: { name: "jobs", description: "Manage scheduled jobs" },
  subCommands: {
    list: listCommand,
    add: addCommand,
    remove: removeCommand,
    run: runCommand,
  },
});
