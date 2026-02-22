import { defineCommand } from "citty";
import { resolve, dirname, join } from "node:path";
import { startAgent } from "@augure/core";
import { prefix, dim, err } from "../colors.js";

export const startCommand = defineCommand({
  meta: {
    name: "start",
    description: "Start the Augure agent",
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

    // Load .env file: explicit --env flag, or .env next to config file
    const envPath = args.env
      ? resolve(args.env)
      : join(dirname(configPath), ".env");
    try {
      process.loadEnvFile(envPath);
      console.log(`${prefix} Loaded env from ${dim(envPath)}`);
    } catch {
      // No .env file found — that's fine, env vars may already be set
    }

    console.log(`${prefix} Starting with config: ${dim(configPath)}`);

    try {
      await startAgent(configPath);
    } catch (e) {
      console.error(`${prefix} ${err("Fatal error:")} ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});
