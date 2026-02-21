import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobStore } from "../jobs.js";
import type { Job } from "@augure/types";

describe("JobStore", () => {
  let dir: string;
  let store: JobStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jobs-test-"));
    store = new JobStore(join(dir, "jobs.json"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should save and load jobs", async () => {
    const job: Job = {
      id: "j1",
      cron: "0 8 * * *",
      prompt: "morning check",
      channel: "telegram",
      enabled: true,
    };

    await store.save([job]);
    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(job);
  });

  it("should return empty array when file does not exist", async () => {
    const loaded = await store.load();
    expect(loaded).toEqual([]);
  });

  it("should overwrite existing file on save", async () => {
    const job1: Job = { id: "j1", cron: "0 8 * * *", prompt: "a", channel: "tg", enabled: true };
    const job2: Job = { id: "j2", cron: "0 9 * * *", prompt: "b", channel: "tg", enabled: true };

    await store.save([job1, job2]);
    await store.save([job2]);

    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("j2");
  });

  it("should write valid JSON to disk", async () => {
    const job: Job = { id: "j1", cron: "* * * * *", prompt: "test", channel: "c", enabled: true };
    await store.save([job]);

    const raw = await readFile(join(dir, "jobs.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual([job]);
  });
});
