import { describe, it, expect, vi } from "vitest";
import { handleCommand } from "../commands.js";
import type { CommandContext, AgentState } from "../commands.js";

function mockContext(): CommandContext {
  return {
    scheduler: { start: vi.fn(), stop: vi.fn() },
    pool: { destroyAll: vi.fn().mockResolvedValue(undefined) },
    agent: {
      getState: vi.fn().mockReturnValue("running" as AgentState),
      setState: vi.fn(),
    },
    skillManager: { updateStatus: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("handleCommand", () => {
  it("/pause sets state to paused and stops scheduler", async () => {
    const ctx = mockContext();
    const result = await handleCommand("/pause", ctx);

    expect(result.handled).toBe(true);
    expect(ctx.scheduler.stop).toHaveBeenCalled();
    expect(ctx.agent.setState).toHaveBeenCalledWith("paused");
    expect(result.response).toContain("paused");
  });

  it("/resume sets state to running and starts scheduler", async () => {
    const ctx = mockContext();
    const result = await handleCommand("/resume", ctx);

    expect(result.handled).toBe(true);
    expect(ctx.scheduler.start).toHaveBeenCalled();
    expect(ctx.agent.setState).toHaveBeenCalledWith("running");
    expect(result.response).toContain("resumed");
  });

  it("/kill destroys containers and sets killed state", async () => {
    const ctx = mockContext();
    const result = await handleCommand("/kill", ctx);

    expect(result.handled).toBe(true);
    expect(ctx.scheduler.stop).toHaveBeenCalled();
    expect(ctx.pool.destroyAll).toHaveBeenCalled();
    expect(ctx.agent.setState).toHaveBeenCalledWith("killed");
    expect(result.response).toContain("Emergency stop");
  });

  it("/status returns agent state string", async () => {
    const ctx = mockContext();
    const result = await handleCommand("/status", ctx);

    expect(result.handled).toBe(true);
    expect(ctx.agent.getState).toHaveBeenCalled();
    expect(result.response).toBe("Agent state: running");
  });

  it("/pause skillId calls updateStatus on skillManager", async () => {
    const ctx = mockContext();
    const result = await handleCommand("/pause my-skill", ctx);

    expect(result.handled).toBe(true);
    expect(ctx.skillManager!.updateStatus).toHaveBeenCalledWith("my-skill", "paused");
    expect(result.response).toBe('Skill "my-skill" paused.');
  });

  it("normal message is not handled", async () => {
    const ctx = mockContext();
    const result = await handleCommand("hello world", ctx);

    expect(result.handled).toBe(false);
    expect(result.response).toBeUndefined();
  });

  it("unknown command is not handled", async () => {
    const ctx = mockContext();
    const result = await handleCommand("/foobar", ctx);

    expect(result.handled).toBe(false);
    expect(result.response).toBeUndefined();
  });

  it("/pause skillId returns error when skillManager is undefined", async () => {
    const ctx = mockContext();
    ctx.skillManager = undefined;
    const result = await handleCommand("/pause my-skill", ctx);

    expect(result.handled).toBe(true);
    expect(result.response).toContain("not configured");
    // Should NOT have paused the agent
    expect(ctx.agent.setState).not.toHaveBeenCalled();
  });
});
