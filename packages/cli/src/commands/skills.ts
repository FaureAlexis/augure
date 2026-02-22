import { defineCommand } from "citty";
import { resolve } from "node:path";
import { SkillManager, SkillRunner } from "@augure/skills";
import { DockerContainerPool } from "@augure/sandbox";
import { loadConfig } from "@augure/core";
import Dockerode from "dockerode";
import { prefix, ok, err, dim, bold, cyan } from "../colors.js";

async function createManager(configArg: string): Promise<{
  manager: SkillManager;
  config: Awaited<ReturnType<typeof loadConfig>>;
  configPath: string;
}> {
  const configPath = resolve(configArg);
  const config = await loadConfig(configPath);
  const skillsPath = resolve(
    configPath,
    "..",
    config.skills?.path ?? "./skills",
  );
  return { manager: new SkillManager(skillsPath), config, configPath };
}

function validateSkillId(id: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    console.error(`${prefix} ${err(`Invalid skill ID: "${id}".`)} IDs must be lowercase alphanumeric with hyphens.`);
    process.exit(1);
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "active": return ok(status);
    case "broken": return err(status);
    case "paused": case "draft": case "testing": return dim(status);
    default: return status;
  }
}

const configArg = {
  type: "string" as const,
  description: "Path to config file",
  alias: "c",
  default: "./augure.json5",
};

const listCommand = defineCommand({
  meta: { name: "list", description: "List all skills with status" },
  args: { config: configArg },
  async run({ args }) {
    const { manager } = await createManager(args.config);
    const skills = await manager.list();

    if (skills.length === 0) {
      console.log(`${prefix} ${dim("No skills found.")}`);
      return;
    }

    console.log(bold(
      ["ID".padEnd(24), "NAME".padEnd(28), "STATUS".padEnd(10), "V".padEnd(4), "TRIGGER".padEnd(18), "UPDATED"].join("")
    ));

    for (const s of skills) {
      const trigger =
        s.trigger.type === "cron"
          ? `cron ${s.trigger.schedule}`
          : s.trigger.type;
      const updated = dim(s.updated.slice(0, 10));
      console.log(
        [
          cyan(s.id.padEnd(24)),
          s.name.slice(0, 26).padEnd(28),
          statusColor(s.status).padEnd(10 + (statusColor(s.status).length - s.status.length)),
          String(s.version).padEnd(4),
          trigger.slice(0, 16).padEnd(18),
          updated,
        ].join(""),
      );
    }
  },
});

const showCommand = defineCommand({
  meta: { name: "show", description: "Show skill details" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Skill ID", required: true },
  },
  async run({ args }) {
    validateSkillId(args.id);
    const { manager } = await createManager(args.config);
    try {
      const skill = await manager.get(args.id);
      console.log(`${bold("ID:")}      ${cyan(skill.meta.id)}`);
      console.log(`${bold("Name:")}    ${skill.meta.name}`);
      console.log(`${bold("Version:")} ${skill.meta.version}`);
      console.log(`${bold("Status:")}  ${statusColor(skill.meta.status)}`);
      console.log(`${bold("Trigger:")} ${skill.meta.trigger.type}${skill.meta.trigger.schedule ? ` ${skill.meta.trigger.schedule}` : ""}`);
      console.log(`${bold("Tags:")}    ${skill.meta.tags.join(", ") || dim("(none)")}`);
      console.log(`${bold("Created:")} ${dim(skill.meta.created)}`);
      console.log(`${bold("Updated:")} ${dim(skill.meta.updated)}`);
      console.log(`${bold("Code:")}    ${skill.code ? ok("yes") : err("no")}`);
      console.log(`${bold("Tests:")}   ${skill.testCode ? ok("yes") : err("no")}`);
      console.log("");
      console.log(skill.body);
    } catch {
      console.error(`${prefix} ${err(`Skill "${args.id}" not found.`)}`);
      process.exit(1);
    }
  },
});

const runCommand = defineCommand({
  meta: { name: "run", description: "Run a skill manually" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Skill ID", required: true },
  },
  async run({ args }) {
    validateSkillId(args.id);
    const { manager, config } = await createManager(args.config);

    if (!(await manager.exists(args.id))) {
      console.error(`${prefix} ${err(`Skill "${args.id}" not found.`)}`);
      process.exit(1);
    }

    console.log(`${prefix} Running skill ${cyan(args.id)}...`);

    const docker = new Dockerode();
    const pool = new DockerContainerPool(docker, {
      image: config.sandbox.image ?? "augure-sandbox:latest",
      maxTotal: config.security.maxConcurrentSandboxes,
    });

    const runner = new SkillRunner({
      pool,
      manager,
      defaults: config.sandbox.defaults,
    });

    try {
      const result = await runner.run(args.id);
      console.log(`${bold("Status:")}   ${result.success ? ok("OK") : err("FAILED")}`);
      console.log(`${bold("Duration:")} ${dim(`${result.durationMs}ms`)}`);
      if (result.output) console.log(`${bold("Output:")}   ${result.output}`);
      if (result.error) console.error(`${bold("Error:")}    ${err(result.error)}`);
      if (!result.success) process.exit(1);
    } finally {
      try { await pool.destroyAll(); } catch { /* cleanup failure should not mask original error */ }
    }
  },
});

const pauseCommand = defineCommand({
  meta: { name: "pause", description: "Pause a skill" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Skill ID", required: true },
  },
  async run({ args }) {
    validateSkillId(args.id);
    const { manager } = await createManager(args.config);
    try {
      await manager.updateStatus(args.id, "paused");
      console.log(`${prefix} ${ok(`Skill "${args.id}" paused.`)}`);
    } catch {
      console.error(`${prefix} ${err(`Skill "${args.id}" not found.`)}`);
      process.exit(1);
    }
  },
});

const resumeCommand = defineCommand({
  meta: { name: "resume", description: "Resume a paused skill" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Skill ID", required: true },
  },
  async run({ args }) {
    validateSkillId(args.id);
    const { manager } = await createManager(args.config);
    try {
      await manager.updateStatus(args.id, "active");
      console.log(`${prefix} ${ok(`Skill "${args.id}" resumed.`)}`);
    } catch {
      console.error(`${prefix} ${err(`Skill "${args.id}" not found.`)}`);
      process.exit(1);
    }
  },
});

const deleteCommand = defineCommand({
  meta: { name: "delete", description: "Delete a skill" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Skill ID", required: true },
  },
  async run({ args }) {
    validateSkillId(args.id);
    const { manager } = await createManager(args.config);
    if (!(await manager.exists(args.id))) {
      console.error(`${prefix} ${err(`Skill "${args.id}" not found.`)}`);
      process.exit(1);
    }
    await manager.delete(args.id);
    console.log(`${prefix} ${ok(`Skill "${args.id}" deleted.`)}`);
  },
});

const logsCommand = defineCommand({
  meta: { name: "logs", description: "Show recent execution logs for a skill" },
  args: {
    config: configArg,
    id: { type: "positional", description: "Skill ID", required: true },
  },
  async run({ args }) {
    validateSkillId(args.id);
    const { manager } = await createManager(args.config);
    const runs = await manager.getRuns(args.id, 10);

    if (runs.length === 0) {
      console.log(`${prefix} ${dim(`No runs found for skill "${args.id}".`)}`);
      return;
    }

    console.log(bold(
      ["TIMESTAMP".padEnd(26), "OK".padEnd(6), "DURATION".padEnd(12), "OUTPUT"].join("")
    ));

    for (const r of runs) {
      const status = r.success ? ok("yes") : err("no ");
      const output = (r.output ?? r.error ?? "").slice(0, 60);
      console.log(
        [
          dim(r.timestamp.slice(0, 24).padEnd(26)),
          (status + " ".repeat(Math.max(0, 6 - (r.success ? 3 : 3)))),
          dim(`${r.durationMs}ms`.padEnd(12)),
          r.success ? output : err(output),
        ].join(""),
      );
    }
  },
});

export const skillsCommand = defineCommand({
  meta: { name: "skills", description: "Manage skills" },
  subCommands: {
    list: listCommand,
    show: showCommand,
    run: runCommand,
    pause: pauseCommand,
    resume: resumeCommand,
    delete: deleteCommand,
    logs: logsCommand,
  },
});
