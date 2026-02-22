import { defineCommand } from "citty";
import { resolve, dirname, join } from "node:path";
import { startAgent, createLogger } from "@augure/core";

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
    debug: {
      type: "boolean",
      description: "Enable debug logging",
      alias: "d",
      default: false,
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const log = createLogger({ level: args.debug ? "debug" : "info" });

    // Load .env file: explicit --env flag, or .env next to config file
    const envPath = args.env
      ? resolve(args.env)
      : join(dirname(configPath), ".env");
    try {
      process.loadEnvFile(envPath);
      log.debug(`Loaded env from ${envPath}`);
    } catch {
      // No .env file found — that's fine, env vars may already be set
    }

    log.info(`Starting with config: ${configPath}`);

    try {
      await startAgent(configPath, { debug: args.debug });
    } catch (e) {
      log.error("Fatal:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
