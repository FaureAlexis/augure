import { defineCommand } from "citty";
import { writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { prefix, ok, dim, bold, cyan } from "../colors.js";

const CONFIG_TEMPLATE = `{
  // Identity
  identity: {
    name: "Augure",
    personality: "Helpful, proactive, concise.",
  },

  // LLM
  llm: {
    default: {
      provider: "openrouter",
      apiKey: "\${OPENROUTER_API_KEY}",
      model: "anthropic/claude-sonnet-4-5",
      maxTokens: 8192,
    },
  },

  // Channels
  channels: {
    telegram: {
      enabled: true,
      botToken: "\${TELEGRAM_BOT_TOKEN}",
      allowedUsers: [], // Add your Telegram user ID
    },
  },

  // Memory
  memory: {
    path: "./memory",
    autoIngest: true,
    maxRetrievalTokens: 2000,
  },

  // Scheduler
  scheduler: {
    heartbeatInterval: "30m",
    jobs: [],
  },

  // Sandbox
  sandbox: {
    runtime: "docker",
    defaults: {
      timeout: 300,
      memoryLimit: "512m",
      cpuLimit: "1.0",
    },
  },

  // Tools
  tools: {},

  // Security
  security: {
    sandboxOnly: true,
    allowedHosts: [],
    maxConcurrentSandboxes: 3,
  },
}
`;

const ENV_TEMPLATE = `# LLM Provider
OPENROUTER_API_KEY=sk-or-...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
`;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Initialize Augure configuration in the current directory",
  },
  async run() {
    const configPath = resolve("augure.json5");
    const envPath = resolve(".env");

    if (await fileExists(configPath)) {
      console.log(`${prefix} ${dim("augure.json5 already exists, skipping.")}`);
    } else {
      await writeFile(configPath, CONFIG_TEMPLATE, "utf-8");
      console.log(`${prefix} ${ok("Created")} augure.json5`);
    }

    if (await fileExists(envPath)) {
      console.log(`${prefix} ${dim(".env already exists, skipping.")}`);
    } else {
      await writeFile(envPath, ENV_TEMPLATE, "utf-8");
      console.log(`${prefix} ${ok("Created")} .env`);
    }

    console.log(`\n${bold("Next steps:")}`);
    console.log(`  1. Edit ${cyan("augure.json5")} with your settings`);
    console.log(`  2. Fill in ${cyan(".env")} with your API keys`);
    console.log(`  3. Run: ${bold("augure start")}`);
  },
});
