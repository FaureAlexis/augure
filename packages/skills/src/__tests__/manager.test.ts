import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillManager } from "../manager.js";
import type { Skill, SkillRunResult, SkillIndex } from "@augure/types";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    meta: {
      id: "test-skill",
      name: "Test Skill",
      version: 1,
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      status: "draft",
      trigger: { type: "manual" },
      sandbox: true,
      tools: ["fetch"],
      tags: ["test", "example"],
      ...overrides.meta,
    },
    body: overrides.body ?? "# Test Skill\n\nThis is a test skill.",
    code: overrides.code,
    testCode: overrides.testCode,
  };
}

function makeRun(overrides: Partial<SkillRunResult> = {}): SkillRunResult {
  return {
    skillId: "test-skill",
    timestamp: "2026-01-15T10:00:00.000Z",
    success: true,
    output: "ok",
    durationMs: 42,
    ...overrides,
  };
}

describe("SkillManager", () => {
  let dir: string;
  let mgr: SkillManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "skills-mgr-test-"));
    mgr = new SkillManager(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // 1. list() returns empty for empty directory
  it("list() returns empty array for empty directory", async () => {
    const result = await mgr.list();
    expect(result).toEqual([]);
  });

  // 2. save() + get() roundtrip with full skill
  it("save() + get() roundtrip preserves meta, body, code, and testCode", async () => {
    const skill = makeSkill({
      code: 'export default async () => "hello";',
      testCode: 'import { expect } from "vitest";\nexpect(true).toBe(true);',
    });

    await mgr.save(skill);
    const loaded = await mgr.get("test-skill");

    expect(loaded.meta.id).toBe(skill.meta.id);
    expect(loaded.meta.name).toBe(skill.meta.name);
    expect(loaded.meta.version).toBe(skill.meta.version);
    expect(loaded.meta.status).toBe(skill.meta.status);
    expect(loaded.meta.trigger).toEqual(skill.meta.trigger);
    expect(loaded.meta.sandbox).toBe(skill.meta.sandbox);
    expect(loaded.meta.tools).toEqual(skill.meta.tools);
    expect(loaded.meta.tags).toEqual(skill.meta.tags);
    expect(loaded.body).toBe(skill.body);
    expect(loaded.code).toBe(skill.code);
    expect(loaded.testCode).toBe(skill.testCode);
  });

  // 3. save() creates directory structure and index
  it("save() creates skill directory, files, and skills-index.json", async () => {
    const skill = makeSkill({ code: "console.log('hi');" });
    await mgr.save(skill);

    // Directory exists
    const entries = await readdir(join(dir, "test-skill"));
    expect(entries).toContain("skill.md");
    expect(entries).toContain("skill.ts");

    // Index exists and contains the skill
    const indexRaw = await readFile(join(dir, "skills-index.json"), "utf-8");
    const index: SkillIndex = JSON.parse(indexRaw);
    expect(index.version).toBe(1);
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].id).toBe("test-skill");
    expect(index.skills[0].name).toBe("Test Skill");
    expect(index.skills[0].status).toBe("draft");
    expect(index.skills[0].tags).toEqual(["test", "example"]);
  });

  // 4. get() works without code/testCode files
  it("get() returns undefined for code/testCode when files are absent", async () => {
    const skill = makeSkill(); // no code or testCode
    await mgr.save(skill);

    const loaded = await mgr.get("test-skill");
    expect(loaded.code).toBeUndefined();
    expect(loaded.testCode).toBeUndefined();
    expect(loaded.meta.id).toBe("test-skill");
    expect(loaded.body).toBe(skill.body);
  });

  // 5. delete() removes directory and updates index
  it("delete() removes skill directory and index entry", async () => {
    const skill = makeSkill({ code: "x" });
    await mgr.save(skill);

    // Verify it exists first
    expect(await mgr.exists("test-skill")).toBe(true);

    await mgr.delete("test-skill");

    // Directory gone
    expect(await mgr.exists("test-skill")).toBe(false);

    // Index updated
    const indexRaw = await readFile(join(dir, "skills-index.json"), "utf-8");
    const index: SkillIndex = JSON.parse(indexRaw);
    expect(index.skills).toHaveLength(0);
  });

  // 6. updateStatus() changes status without touching code
  it("updateStatus() changes status and updated timestamp", async () => {
    const skill = makeSkill({ code: 'const x = "original";' });
    await mgr.save(skill);

    await mgr.updateStatus("test-skill", "active");

    const loaded = await mgr.get("test-skill");
    expect(loaded.meta.status).toBe("active");
    expect(loaded.meta.updated).not.toBe("2026-01-01T00:00:00.000Z");
    expect(loaded.code).toBe('const x = "original";');
  });

  // 7. bumpVersion() increments version
  it("bumpVersion() increments version and returns new value", async () => {
    const skill = makeSkill();
    await mgr.save(skill);

    const newVersion = await mgr.bumpVersion("test-skill");
    expect(newVersion).toBe(2);

    const loaded = await mgr.get("test-skill");
    expect(loaded.meta.version).toBe(2);
    expect(loaded.meta.updated).not.toBe("2026-01-01T00:00:00.000Z");

    // Bump again
    const v3 = await mgr.bumpVersion("test-skill");
    expect(v3).toBe(3);
  });

  // 8. saveRun() + getRuns() persist and retrieve sorted runs
  it("saveRun() + getRuns() persist runs sorted newest first", async () => {
    const skill = makeSkill();
    await mgr.save(skill);

    const run1 = makeRun({ timestamp: "2026-01-15T10:00:00.000Z", output: "first" });
    const run2 = makeRun({ timestamp: "2026-01-15T11:00:00.000Z", output: "second" });
    const run3 = makeRun({ timestamp: "2026-01-15T12:00:00.000Z", output: "third" });

    await mgr.saveRun(run1);
    await mgr.saveRun(run2);
    await mgr.saveRun(run3);

    const runs = await mgr.getRuns("test-skill");
    expect(runs).toHaveLength(3);
    // Newest first
    expect(runs[0].output).toBe("third");
    expect(runs[1].output).toBe("second");
    expect(runs[2].output).toBe("first");
  });

  it("getRuns() respects limit parameter", async () => {
    const skill = makeSkill();
    await mgr.save(skill);

    for (let i = 0; i < 5; i++) {
      await mgr.saveRun(makeRun({ timestamp: `2026-01-15T${String(10 + i).padStart(2, "0")}:00:00.000Z` }));
    }

    const runs = await mgr.getRuns("test-skill", 2);
    expect(runs).toHaveLength(2);
  });

  it("getRuns() returns empty array when no runs directory exists", async () => {
    const runs = await mgr.getRuns("nonexistent-skill");
    expect(runs).toEqual([]);
  });

  // 9. getLastRun() returns null when no runs, returns most recent
  it("getLastRun() returns null when no runs exist", async () => {
    const skill = makeSkill();
    await mgr.save(skill);

    const last = await mgr.getLastRun("test-skill");
    expect(last).toBeNull();
  });

  it("getLastRun() returns the most recent run", async () => {
    const skill = makeSkill();
    await mgr.save(skill);

    await mgr.saveRun(makeRun({ timestamp: "2026-01-15T10:00:00.000Z", output: "old" }));
    await mgr.saveRun(makeRun({ timestamp: "2026-01-15T12:00:00.000Z", output: "newest" }));
    await mgr.saveRun(makeRun({ timestamp: "2026-01-15T11:00:00.000Z", output: "mid" }));

    const last = await mgr.getLastRun("test-skill");
    expect(last).not.toBeNull();
    expect(last!.output).toBe("newest");
  });

  // 10. rebuildIndex() scans directories and rebuilds
  it("rebuildIndex() scans all skill directories", async () => {
    const skill1 = makeSkill();
    makeSkill({
      meta: { id: "another-skill", name: "Another Skill" } as Skill["meta"],
    });
    // Use a fresh manager reference to force full meta
    const s2: Skill = {
      meta: {
        id: "another-skill",
        name: "Another Skill",
        version: 1,
        created: "2026-02-01T00:00:00.000Z",
        updated: "2026-02-01T00:00:00.000Z",
        status: "active",
        trigger: { type: "cron", schedule: "0 9 * * *" },
        sandbox: true,
        tools: [],
        tags: ["ops"],
      },
      body: "# Another\n\nDoes stuff.",
    };

    await mgr.save(skill1);
    await mgr.save(s2);

    // Delete the index file to simulate corruption
    await rm(join(dir, "skills-index.json"));

    const index = await mgr.rebuildIndex();
    expect(index.version).toBe(1);
    expect(index.skills).toHaveLength(2);

    const ids = index.skills.map((s: { id: string }) => s.id).sort();
    expect(ids).toEqual(["another-skill", "test-skill"]);
  });

  it("rebuildIndex() skips directories without skill.md", async () => {
    const skill = makeSkill();
    await mgr.save(skill);

    // Create a stray directory with no skill.md
    const { mkdir: mkdirFs } = await import("node:fs/promises");
    await mkdirFs(join(dir, "not-a-skill"), { recursive: true });

    await rm(join(dir, "skills-index.json"));
    const index = await mgr.rebuildIndex();
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].id).toBe("test-skill");
  });

  // 11. exists() returns true/false correctly
  it("exists() returns true for saved skill, false for missing", async () => {
    expect(await mgr.exists("test-skill")).toBe(false);

    await mgr.save(makeSkill());
    expect(await mgr.exists("test-skill")).toBe(true);

    expect(await mgr.exists("no-such-skill")).toBe(false);
  });

  // 12. list() triggers rebuildIndex when index is missing
  it("list() rebuilds index when skills-index.json is missing", async () => {
    const skill = makeSkill();
    await mgr.save(skill);

    // Remove the index
    await rm(join(dir, "skills-index.json"));

    // list() should still work by rebuilding
    const entries = await mgr.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("test-skill");

    // Index file should have been recreated
    const indexRaw = await readFile(join(dir, "skills-index.json"), "utf-8");
    const index: SkillIndex = JSON.parse(indexRaw);
    expect(index.skills).toHaveLength(1);
  });

  // Additional: index is updated correctly when saving multiple skills
  it("index tracks multiple skills correctly", async () => {
    const s1 = makeSkill();
    const s2: Skill = {
      meta: {
        id: "second-skill",
        name: "Second",
        version: 1,
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        status: "testing",
        trigger: { type: "event", channel: "github" },
        sandbox: false,
        tools: [],
        tags: [],
      },
      body: "Second body.",
    };

    await mgr.save(s1);
    await mgr.save(s2);

    const entries = await mgr.list();
    expect(entries).toHaveLength(2);

    // Update first skill
    await mgr.updateStatus("test-skill", "active");
    const updated = await mgr.list();
    const entry = updated.find((e) => e.id === "test-skill");
    expect(entry?.status).toBe("active");
    expect(updated).toHaveLength(2);
  });

  // Additional: save() updates existing index entry instead of duplicating
  it("save() updates existing index entry without duplicating", async () => {
    const skill = makeSkill();
    await mgr.save(skill);
    await mgr.save(skill); // save again

    const indexRaw = await readFile(join(dir, "skills-index.json"), "utf-8");
    const index: SkillIndex = JSON.parse(indexRaw);
    expect(index.skills).toHaveLength(1);
  });

  // Additional: delete on non-existent skill does not throw
  it("delete() on non-existent skill does not throw", async () => {
    await expect(mgr.delete("no-such-skill")).resolves.not.toThrow();
  });
});
