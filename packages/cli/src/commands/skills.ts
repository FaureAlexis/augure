import { defineCommand } from "citty";
import { resolve } from "node:path";
import { SkillManager, SkillRunner } from "@augure/skills";
import { DockerContainerPool } from "@augure/sandbox";
import { loadConfig } from "@augure/core";
import Dockerode from "dockerode";

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
    console.error(
      `Invalid skill ID: "${id}". IDs must be lowercase alphanumeric with hyphens.`,
    );
    process.exit(1);
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
      console.log("No skills found.");
      return;
    }

    const header = [
      "ID".padEnd(24),
      "NAME".padEnd(28),
      "STATUS".padEnd(10),
      "V".padEnd(4),
      "TRIGGER".padEnd(18),
      "UPDATED",
    ].join("");
    console.log(header);

    for (const s of skills) {
      const trigger =
        s.trigger.type === "cron"
          ? `cron ${s.trigger.schedule}`
          : s.trigger.type;
      const updated = s.updated.slice(0, 10);
      console.log(
        [
          s.id.padEnd(24),
          s.name.slice(0, 26).padEnd(28),
          s.status.padEnd(10),
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
      console.log(`ID:      ${skill.meta.id}`);
      console.log(`Name:    ${skill.meta.name}`);
      console.log(`Version: ${skill.meta.version}`);
      console.log(`Status:  ${skill.meta.status}`);
      console.log(
        `Trigger: ${skill.meta.trigger.type}${skill.meta.trigger.schedule ? ` ${skill.meta.trigger.schedule}` : ""}`,
      );
      console.log(`Tags:    ${skill.meta.tags.join(", ") || "(none)"}`);
      console.log(`Created: ${skill.meta.created}`);
      console.log(`Updated: ${skill.meta.updated}`);
      console.log(`Code:    ${skill.code ? "yes" : "no"}`);
      console.log(`Tests:   ${skill.testCode ? "yes" : "no"}`);
      console.log("");
      console.log(skill.body);
    } catch {
      console.error(`Skill "${args.id}" not found.`);
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
      console.error(`Skill "${args.id}" not found.`);
      process.exit(1);
    }

    console.log(`Running skill "${args.id}"...`);

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
      console.log(`Status:   ${result.success ? "OK" : "FAILED"}`);
      console.log(`Duration: ${result.durationMs}ms`);
      if (result.output) console.log(`Output:   ${result.output}`);
      if (result.error) console.error(`Error:    ${result.error}`);
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
      console.log(`Skill "${args.id}" paused.`);
    } catch {
      console.error(`Skill "${args.id}" not found.`);
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
      console.log(`Skill "${args.id}" resumed.`);
    } catch {
      console.error(`Skill "${args.id}" not found.`);
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
      console.error(`Skill "${args.id}" not found.`);
      process.exit(1);
    }
    await manager.delete(args.id);
    console.log(`Skill "${args.id}" deleted.`);
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
      console.log(`No runs found for skill "${args.id}".`);
      return;
    }

    const header = [
      "TIMESTAMP".padEnd(26),
      "OK".padEnd(6),
      "DURATION".padEnd(12),
      "OUTPUT",
    ].join("");
    console.log(header);

    for (const r of runs) {
      const ok = r.success ? "yes" : "no";
      const output = (r.output ?? r.error ?? "").slice(0, 60);
      console.log(
        [
          r.timestamp.slice(0, 24).padEnd(26),
          ok.padEnd(6),
          `${r.durationMs}ms`.padEnd(12),
          output,
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
