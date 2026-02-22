import { createRequire } from "node:module";
import { defineCommand, runMain } from "citty";
import { startCommand } from "./commands/start.js";
import { initCommand } from "./commands/init.js";
import { skillsCommand } from "./commands/skills.js";

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
    init: initCommand,
    skills: skillsCommand,
  },
});

runMain(main);
