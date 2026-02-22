import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillManager } from "@augure/skills";
import type { Skill, SkillRunResult } from "@augure/types";

function makeSkill(id: string, overrides?: Partial<Skill["meta"]>): Skill {
  return {
    meta: {
      id,
      name: `Test Skill ${id}`,
      version: 1,
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      status: "active",
      trigger: { type: "manual" },
      sandbox: true,
      tools: [],
      tags: ["test"],
      ...overrides,
    },
    body: `# ${id}\n\nA test skill.`,
    code: 'export default async () => ({ output: "ok" });',
  };
}

describe("skills CLI operations", () => {
  let dir: string;
  let manager: SkillManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "augure-skills-cli-"));
    manager = new SkillManager(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("list returns empty array when no skills", async () => {
    const skills = await manager.list();
    expect(skills).toEqual([]);
  });

  it("list returns all saved skills", async () => {
    await manager.save(makeSkill("alpha"));
    await manager.save(makeSkill("beta", { status: "paused" }));

    const skills = await manager.list();
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("show loads skill details", async () => {
    await manager.save(makeSkill("my-skill"));

    const skill = await manager.get("my-skill");
    expect(skill.meta.id).toBe("my-skill");
    expect(skill.meta.name).toBe("Test Skill my-skill");
    expect(skill.body).toContain("A test skill.");
    expect(skill.code).toBeDefined();
  });

  it("show throws for non-existent skill", async () => {
    await expect(manager.get("nope")).rejects.toThrow();
  });

  it("pause sets status to paused", async () => {
    await manager.save(makeSkill("pausable"));
    await manager.updateStatus("pausable", "paused");

    const skill = await manager.get("pausable");
    expect(skill.meta.status).toBe("paused");
  });

  it("resume sets status to active", async () => {
    await manager.save(makeSkill("resumable", { status: "paused" }));
    await manager.updateStatus("resumable", "active");

    const skill = await manager.get("resumable");
    expect(skill.meta.status).toBe("active");
  });

  it("delete removes a skill", async () => {
    await manager.save(makeSkill("deletable"));
    expect(await manager.exists("deletable")).toBe(true);

    await manager.delete("deletable");
    expect(await manager.exists("deletable")).toBe(false);

    const skills = await manager.list();
    expect(skills.find((s) => s.id === "deletable")).toBeUndefined();
  });

  it("logs returns run history", async () => {
    await manager.save(makeSkill("logged"));

    const run1: SkillRunResult = {
      skillId: "logged",
      timestamp: "2026-02-20T08:00:00Z",
      success: true,
      output: "Found 3 listings",
      durationMs: 4230,
    };
    const run2: SkillRunResult = {
      skillId: "logged",
      timestamp: "2026-02-21T08:00:00Z",
      success: false,
      error: "Timeout",
      durationMs: 30000,
    };

    await manager.saveRun(run1);
    await manager.saveRun(run2);

    const runs = await manager.getRuns("logged", 10);
    expect(runs).toHaveLength(2);
    // Newest first
    expect(runs[0].timestamp).toBe("2026-02-21T08:00:00Z");
    expect(runs[0].success).toBe(false);
    expect(runs[1].success).toBe(true);
  });
});
