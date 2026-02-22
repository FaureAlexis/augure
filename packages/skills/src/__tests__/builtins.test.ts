import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillManager } from "../manager.js";
import { installBuiltins, healthCheck, dailyDigest } from "../builtins/index.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "builtins-"));
});

describe("installBuiltins", () => {
  it("should install health-check and daily-digest", async () => {
    const manager = new SkillManager(dir);

    await installBuiltins(manager);

    const skills = await manager.list();
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.id).sort()).toEqual(["daily-digest", "health-check"]);
  });

  it("should be idempotent", async () => {
    const manager = new SkillManager(dir);

    await installBuiltins(manager);
    await installBuiltins(manager);

    const skills = await manager.list();
    expect(skills).toHaveLength(2);
  });

  it("should not overwrite existing skills", async () => {
    const manager = new SkillManager(dir);

    // Install first
    await installBuiltins(manager);

    // Modify a skill
    const skill = await manager.get("health-check");
    skill.meta.version = 99;
    await manager.save(skill);

    // Install again
    await installBuiltins(manager);

    // Should still be version 99
    const check = await manager.get("health-check");
    expect(check.meta.version).toBe(99);
  });

  it("health-check skill should have correct metadata", () => {
    expect(healthCheck.meta.id).toBe("health-check");
    expect(healthCheck.meta.trigger.type).toBe("cron");
    expect(healthCheck.meta.trigger.schedule).toBe("0 6 * * *");
    expect(healthCheck.meta.sandbox).toBe(false);
  });

  it("daily-digest skill should have correct metadata", () => {
    expect(dailyDigest.meta.id).toBe("daily-digest");
    expect(dailyDigest.meta.trigger.type).toBe("cron");
    expect(dailyDigest.meta.trigger.schedule).toBe("0 8 * * *");
    expect(dailyDigest.meta.sandbox).toBe(true);
  });
});
