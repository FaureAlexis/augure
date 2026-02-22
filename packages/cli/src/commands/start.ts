import { defineCommand } from "citty";
import { resolve } from "node:path";
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
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    console.log(`${prefix} Starting with config: ${dim(configPath)}`);

    try {
      const { startAgent } = await import("@augure/core");
      await startAgent(configPath);
    } catch (e) {
      console.error(`${prefix} ${err("Fatal error:")} ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});
