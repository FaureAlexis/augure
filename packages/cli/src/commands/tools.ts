import { defineCommand } from "citty";
import { resolve } from "node:path";
import { loadConfig } from "@augure/core";
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
} from "@augure/tools";
import { FileMemoryStore } from "@augure/memory";
import { CronScheduler } from "@augure/scheduler";
import { prefix, ok, err, dim, bold, cyan } from "../colors.js";

const configArg = {
  type: "string" as const,
  description: "Path to config file",
  alias: "c",
  default: "./augure.json5",
};

function createToolRegistry(config: import("@augure/types").AppConfig, configPath: string) {
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

  const memoryPath = resolve(configPath, "..", config.memory.path);
  const memory = new FileMemoryStore(memoryPath);
  const scheduler = new CronScheduler();

  tools.setContext({ config, memory, scheduler });
  return tools;
}

const listCommand = defineCommand({
  meta: { name: "list", description: "List all tools and their configuration status" },
  args: { config: configArg },
  async run({ args }) {
    const configPath = resolve(args.config);
    const config = await loadConfig(configPath);
    const tools = createToolRegistry(config, configPath);

    console.log(bold(
      ["TOOL".padEnd(22), "STATUS".padEnd(18), "RISK"].join(""),
    ));

    const memoryPath = resolve(configPath, "..", config.memory.path);
    const ctx = { config, memory: new FileMemoryStore(memoryPath), scheduler: new CronScheduler() };

    for (const tool of tools.list()) {
      let statusLabel = "configured";
      let statusFn = ok;
      if (tool.configCheck) {
        const warning = tool.configCheck(ctx);
        if (warning) {
          statusLabel = "not configured";
          statusFn = dim;
        }
      }

      const risk = tool.riskLevel === "high" ? err("high") : dim("-");
      console.log(
        [
          cyan(tool.name.padEnd(22)),
          statusFn(statusLabel.padEnd(18)),
          risk,
        ].join(""),
      );
    }
  },
});

const testCommand = defineCommand({
  meta: { name: "test", description: "Test a tool with sample input" },
  args: {
    config: configArg,
    name: { type: "positional", description: "Tool name", required: true },
    args: { type: "string", description: "JSON arguments", alias: "a" },
  },
  async run({ args: cmdArgs }) {
    const configPath = resolve(cmdArgs.config);
    const config = await loadConfig(configPath);
    const tools = createToolRegistry(config, configPath);

    const tool = tools.list().find((t) => t.name === cmdArgs.name);
    if (!tool) {
      console.error(`${prefix} ${err(`Tool "${cmdArgs.name}" not found.`)}`);
      process.exit(1);
    }

    // Determine test arguments
    let testArgs: unknown;
    if (cmdArgs.args) {
      try {
        testArgs = JSON.parse(cmdArgs.args);
      } catch {
        console.error(`${prefix} ${err("Invalid JSON for --args")}`);
        process.exit(1);
      }
    } else {
      // Default test arguments for known tools
      switch (cmdArgs.name) {
        case "datetime":
          testArgs = {};
          break;
        case "memory_read": {
          const memoryPath = resolve(configPath, "..", config.memory.path);
          const store = new FileMemoryStore(memoryPath);
          const files = await store.list();
          if (files.length > 0) {
            testArgs = { path: files[0] };
          } else {
            console.log(`${prefix} ${dim("No memory files available for test.")}`);
            return;
          }
          break;
        }
        default:
          console.log(`${prefix} ${dim(`Manual test required: provide JSON args via --args '{"key":"value"}'`)}`);
          return;
      }
    }

    console.log(`${prefix} Testing ${cyan(cmdArgs.name)}...`);

    try {
      const result = await tools.execute(cmdArgs.name, testArgs);
      console.log(`${bold("Success:")} ${result.success ? ok("yes") : err("no")}`);
      console.log(`${bold("Output:")}  ${result.output.slice(0, 500)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${prefix} ${err(`Error: ${msg}`)}`);
      process.exit(1);
    }
  },
});

export const toolsCommand = defineCommand({
  meta: { name: "tools", description: "Manage and test tools" },
  subCommands: {
    list: listCommand,
    test: testCommand,
  },
});
