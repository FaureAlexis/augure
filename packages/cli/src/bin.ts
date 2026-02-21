#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { startCommand } from "./commands/start.js";
import { initCommand } from "./commands/init.js";

const main = defineCommand({
  meta: {
    name: "augure",
    description: "Augure — your proactive AI agent",
    version: "0.1.0",
  },
  subCommands: {
    start: startCommand,
    init: initCommand,
  },
});

runMain(main);
