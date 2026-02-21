import { defineCommand } from "citty";
import { resolve } from "node:path";

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
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    console.log(`[augure] Starting with config: ${configPath}`);

    try {
      const { startAgent } = await import("@augure/core");
      await startAgent(configPath);
    } catch (err) {
      console.error(
        "[augure] Fatal error:",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  },
});
