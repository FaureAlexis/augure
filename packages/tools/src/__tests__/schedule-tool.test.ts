import { describe, it, expect, vi } from "vitest";
import { scheduleTool } from "../schedule.js";
import type { ToolContext, MemoryStore, Scheduler, Job } from "@augure/types";

function makeCtx(schedulerOverrides: Partial<Scheduler> = {}): ToolContext {
  return {
    config: {} as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {
      start: vi.fn(),
      stop: vi.fn(),
      addJob: vi.fn(),
      removeJob: vi.fn(),
      listJobs: vi.fn().mockReturnValue([]),
      triggerJob: vi.fn(),
      ...schedulerOverrides,
    } as unknown as Scheduler,
  };
}

describe("scheduleTool", () => {
  it("should list jobs", async () => {
    const jobs: Job[] = [
      { id: "j1", cron: "0 8 * * *", prompt: "morning", channel: "tg", enabled: true },
    ];
    const ctx = makeCtx({ listJobs: vi.fn().mockReturnValue(jobs) });
    const result = await scheduleTool.execute({ action: "list" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("j1");
    expect(result.output).toContain("0 8 * * *");
  });

  it("should create a job", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute(
      { action: "create", id: "j2", cron: "*/10 * * * *", prompt: "check" },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.scheduler.addJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "j2", cron: "*/10 * * * *", prompt: "check" }),
    );
  });

  it("should delete a job", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute({ action: "delete", id: "j1" }, ctx);
    expect(result.success).toBe(true);
    expect(ctx.scheduler.removeJob).toHaveBeenCalledWith("j1");
  });

  it("should return error for unknown action", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute({ action: "unknown" }, ctx);
    expect(result.success).toBe(false);
  });

  it("should return error when create is missing cron", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute(
      { action: "create", prompt: "test" },
      ctx,
    );
    expect(result.success).toBe(false);
  });
});
