import { defineCommand } from "citty";
import { resolve } from "node:path";
import { pidPath, readPid, isRunning, removePid } from "../pid.js";
import { prefix, ok, err, dim } from "../colors.js";

export const stopCommand = defineCommand({
  meta: {
    name: "stop",
    description: "Stop the running Augure agent",
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
    const path = pidPath(configPath);
    const pid = await readPid(path);

    if (pid === null) {
      console.log(`${prefix} ${dim("No PID file found — agent is not running.")}`);
      return;
    }

    if (!isRunning(pid)) {
      console.log(`${prefix} ${dim(`Stale PID file (PID ${pid} is not running). Cleaning up.`)}`);
      await removePid(path);
      return;
    }

    console.log(`${prefix} Stopping agent (PID ${pid})...`);

    // Send SIGTERM for graceful shutdown
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process exited between isRunning check and kill
      await removePid(path);
      console.log(`${prefix} ${ok("Agent already stopped.")}`);
      return;
    }

    // Wait up to 5 seconds for the process to exit
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!isRunning(pid)) {
        await removePid(path);
        console.log(`${prefix} ${ok("Agent stopped.")}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // Force kill if still running
    console.log(`${prefix} ${dim("Graceful shutdown timed out, sending SIGKILL...")}`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already dead */
    }
    await removePid(path);
    console.log(`${prefix} ${err("Agent force-killed.")}`);
  },
});
