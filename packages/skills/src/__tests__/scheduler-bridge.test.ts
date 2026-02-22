import { describe, it, expect, vi } from "vitest";
import { SkillSchedulerBridge } from "../scheduler-bridge.js";
import type { Scheduler } from "@augure/types";
import type { SkillManager } from "../manager.js";

function mockScheduler(): Scheduler {
  const jobs: Array<{ id: string; cron: string; prompt: string; channel: string; enabled: boolean }> = [];
  return {
    addJob: vi.fn((job) => jobs.push(job)),
    removeJob: vi.fn((id) => {
      const idx = jobs.findIndex((j) => j.id === id);
      if (idx >= 0) jobs.splice(idx, 1);
    }),
    listJobs: vi.fn(() => [...jobs]),
    start: vi.fn(),
    stop: vi.fn(),
    onJobTrigger: vi.fn(),
    loadPersistedJobs: vi.fn(),
  } as unknown as Scheduler;
}

function mockManager(skills: Array<{ id: string; status: string; trigger: { type: string; schedule?: string; channel?: string } }>): SkillManager {
  return {
    list: vi.fn().mockResolvedValue(
      skills.map((s) => ({ ...s, name: s.id, version: 1, tags: [], updated: "" })),
    ),
  } as unknown as SkillManager;
}

describe("SkillSchedulerBridge", () => {
  it("should register cron jobs for active cron skills", async () => {
    const scheduler = mockScheduler();
    const manager = mockManager([
      { id: "daily-check", status: "active", trigger: { type: "cron", schedule: "0 8 * * *", channel: "telegram" } },
      { id: "manual-skill", status: "active", trigger: { type: "manual" } },
    ]);
    const bridge = new SkillSchedulerBridge(scheduler, manager);

    await bridge.syncAll();

    expect(scheduler.addJob).toHaveBeenCalledTimes(1);
    expect(scheduler.addJob).toHaveBeenCalledWith(expect.objectContaining({
      id: "skill:daily-check",
      cron: "0 8 * * *",
      prompt: "[skill:run:daily-check]",
      channel: "telegram",
    }));
  });

  it("should skip paused skills", async () => {
    const scheduler = mockScheduler();
    const manager = mockManager([
      { id: "paused", status: "paused", trigger: { type: "cron", schedule: "0 8 * * *" } },
    ]);
    const bridge = new SkillSchedulerBridge(scheduler, manager);

    await bridge.syncAll();

    expect(scheduler.addJob).not.toHaveBeenCalled();
  });

  it("should remove orphaned skill jobs", async () => {
    const scheduler = mockScheduler();
    // Pre-add an orphaned job
    scheduler.addJob({ id: "skill:old-skill", cron: "0 1 * * *", prompt: "[skill:run:old-skill]", channel: "default", enabled: true });
    const manager = mockManager([]); // no skills
    const bridge = new SkillSchedulerBridge(scheduler, manager);

    await bridge.syncAll();

    expect(scheduler.removeJob).toHaveBeenCalledWith("skill:old-skill");
  });

  it("should register a single skill", () => {
    const scheduler = mockScheduler();
    const manager = mockManager([]);
    const bridge = new SkillSchedulerBridge(scheduler, manager);

    bridge.register("test-skill", "0 9 * * *", "telegram");

    expect(scheduler.addJob).toHaveBeenCalledWith(expect.objectContaining({
      id: "skill:test-skill",
      cron: "0 9 * * *",
      prompt: "[skill:run:test-skill]",
      channel: "telegram",
    }));
  });

  it("should unregister a skill", () => {
    const scheduler = mockScheduler();
    scheduler.addJob({ id: "skill:test", cron: "0 1 * * *", prompt: "", channel: "", enabled: true });
    const bridge = new SkillSchedulerBridge(scheduler, mockManager([]));

    bridge.unregister("test");

    expect(scheduler.removeJob).toHaveBeenCalledWith("skill:test");
  });
});

describe("SkillSchedulerBridge.parseSkillPrompt", () => {
  it("should parse valid skill prompt", () => {
    expect(SkillSchedulerBridge.parseSkillPrompt("[skill:run:daily-check]")).toBe("daily-check");
  });

  it("should return null for non-skill prompt", () => {
    expect(SkillSchedulerBridge.parseSkillPrompt("Check weather")).toBeNull();
  });
});
