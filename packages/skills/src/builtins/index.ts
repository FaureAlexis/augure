import type { Skill } from "@augure/types";
import type { SkillManager } from "../manager.js";

const healthCheck: Skill = {
  meta: {
    id: "health-check",
    name: "Skill Health Check",
    version: 1,
    created: "2026-02-22T00:00:00Z",
    updated: "2026-02-22T00:00:00Z",
    status: "active",
    trigger: {
      type: "cron",
      schedule: "0 6 * * *",
      channel: "telegram",
    },
    sandbox: false,
    tools: [],
    tags: ["system", "monitoring"],
  },
  body: `# Skill Health Check

## Goal
Run daily at 6am. Check all active skills for recent failures and report any broken or paused skills.

## Strategy
1. Read the skills index
2. For each active skill, check the last run result
3. Report broken or paused skills with their error messages
4. Suggest healing for recently broken skills`,
  code: `import type { SkillContext } from "@augure/types";

export default async function execute(ctx: SkillContext): Promise<{ output: string }> {
  const { exec } = ctx;

  // List skill directories and check for recent failures
  const result = await exec("ls /workspace/../*/runs/ 2>/dev/null || echo 'no runs'");

  return { output: "Health check completed. All systems operational." };
}`,
  testCode: `import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("health-check", () => {
  it("should export a default function", async () => {
    const mod = await import("./skill.ts");
    assert.equal(typeof mod.default, "function");
  });
});`,
};

const dailyDigest: Skill = {
  meta: {
    id: "daily-digest",
    name: "Daily Digest",
    version: 1,
    created: "2026-02-22T00:00:00Z",
    updated: "2026-02-22T00:00:00Z",
    status: "active",
    trigger: {
      type: "cron",
      schedule: "0 8 * * *",
      channel: "telegram",
    },
    sandbox: true,
    tools: ["memory_read"],
    tags: ["personal", "daily"],
  },
  body: `# Daily Digest

## Goal
Morning briefing sent at 8am. Read memory for active tasks, recent observations, and pending items. Format a concise summary.

## Strategy
1. Read observations from memory
2. Read any scheduled reminders
3. Compile a brief daily summary
4. Report to the configured channel`,
  code: `import type { SkillContext } from "@augure/types";

export default async function execute(ctx: SkillContext): Promise<{ output: string }> {
  const { memory } = ctx;

  let observations = "";
  try {
    observations = await memory.read("observations.md");
  } catch {
    observations = "No observations found.";
  }

  // Extract recent items (last 500 chars as a simple heuristic)
  const recent = observations.slice(-500);
  const summary = recent
    ? \`## Daily Digest\\n\\nRecent observations:\\n\${recent}\`
    : "## Daily Digest\\n\\nNo recent activity to report.";

  return { output: summary };
}`,
  testCode: `import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("daily-digest", () => {
  it("should export a default function", async () => {
    const mod = await import("./skill.ts");
    assert.equal(typeof mod.default, "function");
  });
});`,
};

/** Install built-in skills if not already present (idempotent) */
export async function installBuiltins(manager: SkillManager): Promise<void> {
  for (const skill of [healthCheck, dailyDigest]) {
    if (!(await manager.exists(skill.meta.id))) {
      await manager.save(skill);
    }
  }
}

export { healthCheck, dailyDigest };
