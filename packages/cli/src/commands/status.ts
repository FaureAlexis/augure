import { defineCommand } from "citty";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { pidPath, readPid, isRunning } from "../pid.js";
import { prefix, ok, err, dim, bold, cyan } from "../colors.js";

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show agent status overview",
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

    // Agent running status
    const path = pidPath(configPath);
    const pid = await readPid(path);
    const running = pid !== null && isRunning(pid);
    const agentStatus = running
      ? ok(`running (PID ${pid})`)
      : dim("not running");

    console.log(`${prefix} ${bold("status")}`);
    console.log(`  ${bold("Agent:")}    ${agentStatus}`);

    // Try to load config for more details
    let config: import("@augure/types").AppConfig | undefined;
    try {
      const { loadConfig } = await import("@augure/core");
      config = await loadConfig(configPath);
    } catch {
      console.log(`  ${bold("Config:")}   ${err("could not load")}`);
      return;
    }

    console.log(`  ${bold("Identity:")} ${cyan(config.identity.name)}`);
    console.log(`  ${bold("LLM:")}      ${config.llm.default.model} (${config.llm.default.provider})`);

    // Memory info
    const memoryPath = resolve(configPath, "..", config.memory.path);
    let memoryCount = 0;
    try {
      const { FileMemoryStore } = await import("@augure/memory");
      const store = new FileMemoryStore(memoryPath);
      const files = await store.list();
      memoryCount = files.length;
    } catch {
      /* memory dir may not exist */
    }
    console.log(`  ${bold("Memory:")}   ${memoryPath} (${memoryCount} files)`);

    // Jobs info
    const jobStorePath = resolve(configPath, "..", "jobs.json");
    let activeJobs = 0;
    let disabledJobs = 0;
    try {
      const { JobStore } = await import("@augure/scheduler");
      const store = new JobStore(jobStorePath);
      const jobs = await store.load();
      // Merge with config jobs
      const allJobIds = new Set(jobs.map((j) => j.id));
      for (const cj of config.scheduler.jobs) {
        if (!allJobIds.has(cj.id)) {
          allJobIds.add(cj.id);
          jobs.push({ ...cj, enabled: true });
        }
      }
      for (const j of jobs) {
        if (j.enabled) activeJobs++;
        else disabledJobs++;
      }
    } catch {
      /* no jobs file */
    }
    console.log(`  ${bold("Jobs:")}     ${activeJobs} active${disabledJobs > 0 ? `, ${disabledJobs} disabled` : ""}`);

    // Channels info
    const tg = config.channels.telegram?.enabled ? ok("✓") : dim("✗");
    const wa = config.channels.whatsapp?.enabled ? ok("✓") : dim("✗");
    const web = config.channels.web?.enabled ? ok("✓") : dim("✗");
    console.log(`  ${bold("Channels:")} telegram ${tg}  whatsapp ${wa}  web ${web}`);

    // Docker connectivity
    try {
      const Dockerode = (await import("dockerode")).default;
      const docker = new Dockerode();
      await docker.ping();
      console.log(`  ${bold("Docker:")}   ${ok("connected")}`);
    } catch {
      console.log(`  ${bold("Docker:")}   ${dim("not available")}`);
    }

    // Skills info
    if (config.skills) {
      const skillsPath = resolve(configPath, "..", config.skills.path);
      let skillCount = 0;
      try {
        const entries = await readdir(skillsPath);
        for (const entry of entries) {
          try {
            const subEntries = await readdir(resolve(skillsPath, entry));
            if (subEntries.includes("skill.md")) {
              skillCount++;
            }
          } catch {
            /* not a directory */
          }
        }
      } catch {
        /* skills dir may not exist */
      }
      console.log(`  ${bold("Skills:")}   ${skillCount} found`);
    }
  },
});
