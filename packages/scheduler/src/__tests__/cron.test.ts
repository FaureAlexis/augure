import { describe, it, expect, vi } from "vitest";
import { CronScheduler } from "../cron.js";
import type { Job } from "@augure/types";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    cron: "*/5 * * * *",
    prompt: "Run report",
    channel: "general",
    enabled: true,
    ...overrides,
  };
}

describe("CronScheduler", () => {
  it("should add and list jobs", () => {
    const scheduler = new CronScheduler();
    const job = makeJob();
    scheduler.addJob(job);

    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(job);

    scheduler.stop();
  });

  it("should remove a job", () => {
    const scheduler = new CronScheduler();
    scheduler.addJob(makeJob());
    scheduler.removeJob("job-1");

    expect(scheduler.listJobs()).toHaveLength(0);
  });

  it("should reject invalid cron expressions", () => {
    const scheduler = new CronScheduler();
    expect(() =>
      scheduler.addJob(makeJob({ cron: "not-a-cron" })),
    ).toThrow("Invalid cron expression: not-a-cron");
  });

  it("should trigger a job manually", async () => {
    const scheduler = new CronScheduler();
    const job = makeJob();
    scheduler.addJob(job);

    const handler = vi.fn();
    scheduler.onJobTrigger(handler);

    await scheduler.triggerJob("job-1");

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(job);

    scheduler.stop();
  });

  it("should throw when triggering non-existent job", async () => {
    const scheduler = new CronScheduler();
    await expect(scheduler.triggerJob("nope")).rejects.toThrow(
      "Job not found: nope",
    );
  });
});
