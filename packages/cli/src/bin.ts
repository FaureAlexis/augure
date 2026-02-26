import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand } from "./commands/doctor.js";
import { skillsCommand } from "./commands/skills.js";
import { memoryCommand } from "./commands/memory.js";
import { jobsCommand } from "./commands/jobs.js";
import { channelsCommand } from "./commands/channels.js";
import { toolsCommand } from "./commands/tools.js";
import { mcpCommand } from "./commands/mcp.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const main = defineCommand({
  meta: {
    name: "augure",
    description: "Augure — your proactive AI agent",
    version,
  },
  subCommands: {
    start: startCommand,
    stop: stopCommand,
    init: initCommand,
    status: statusCommand,
    doctor: doctorCommand,
    skills: skillsCommand,
    memory: memoryCommand,
    jobs: jobsCommand,
    channels: channelsCommand,
    tools: toolsCommand,
    mcp: mcpCommand,
  },
});

runMain(main);
