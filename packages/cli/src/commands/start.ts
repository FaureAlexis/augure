import { defineCommand } from "citty";
import { resolve, dirname, join } from "node:path";
import { openSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { startAgent, createLogger } from "@augure/core";
import { pidPath, writePid, removePid } from "../pid.js";

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
      default: false,
    },
    daemon: {
      type: "boolean",
      description: "Run as background daemon",
      default: false,
    },
    mcp: {
      type: "boolean",
      description: "Enable MCP server",
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

    // Daemon mode: spawn detached child and exit parent
    if (args.daemon) {
      const logFile = join(dirname(configPath), "augure.log");
      const fd = openSync(logFile, "a");
      const childArgs = ["start", "--config", configPath];
      if (args.env) childArgs.push("--env", resolve(args.env));
      if (args.debug) childArgs.push("--debug");
      if (args.mcp) childArgs.push("--mcp");

      const child = spawn(process.execPath, [process.argv[1], ...childArgs], {
        detached: true,
        stdio: ["ignore", fd, fd],
        env: process.env,
      });
      child.unref();
      log.info(`Daemon started (PID ${child.pid}), log: ${logFile}`);
      return;
    }

    // Write PID file (best-effort — directory may not exist yet)
    const pidFile = pidPath(configPath);
    let pidWritten = false;
    try {
      await writePid(pidFile);
      pidWritten = true;
    } catch {
      // PID file write failed — likely the config directory doesn't exist
    }

    // Ensure PID file is cleaned up on exit
    // main.ts registers SIGINT/SIGTERM handlers that call process.exit(),
    // so the "exit" handler below covers all shutdown paths.
    if (pidWritten) {
      process.on("exit", () => {
        try {
          unlinkSync(pidFile);
        } catch {
          /* ignore */
        }
      });
    }

    log.info(`Starting with config: ${configPath}`);

    try {
      await startAgent(configPath, { debug: args.debug, mcp: args.mcp });
    } catch (e) {
      await removePid(pidFile);
      log.error("Fatal:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
