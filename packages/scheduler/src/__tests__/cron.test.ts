import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CronScheduler } from "../cron.js";
import { JobStore } from "../jobs.js";
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

describe("CronScheduler with persistence", () => {
  let dir: string;
  let store: JobStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sched-test-"));
    store = new JobStore(join(dir, "jobs.json"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should persist jobs when added", async () => {
    const scheduler = new CronScheduler(store);
    scheduler.addJob(makeJob());
    scheduler.stop();

    // Wait for async persist
    await new Promise((r) => setTimeout(r, 50));

    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("job-1");
  });

  it("should persist after removal", async () => {
    const scheduler = new CronScheduler(store);
    scheduler.addJob(makeJob({ id: "a" }));
    scheduler.addJob(makeJob({ id: "b" }));
    scheduler.removeJob("a");
    scheduler.stop();

    await new Promise((r) => setTimeout(r, 50));

    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("b");
  });

  it("should load persisted jobs on loadPersistedJobs()", async () => {
    await store.save([makeJob({ id: "restored" })]);

    const scheduler = new CronScheduler(store);
    await scheduler.loadPersistedJobs();

    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("restored");

    scheduler.stop();
  });
});
