import { describe, it, expect, vi } from "vitest";
import { opencodeTool } from "../opencode.js";
import type {
  ToolContext,
  MemoryStore,
  Scheduler,
  Container,
  ContainerPool,
} from "@augure/types";

function mockContainer(
  overrides: Partial<Container> = {},
): Container {
  return {
    id: "test-container",
    status: "idle",
    exec: vi
      .fn()
      .mockResolvedValue({
        exitCode: 0,
        stdout: "Task completed successfully.\n",
        stderr: "",
      }),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockPool(container?: Container): ContainerPool {
  const c = container ?? mockContainer();
  return {
    acquire: vi.fn().mockResolvedValue(c),
    release: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    destroyAll: vi.fn().mockResolvedValue(undefined),
    stats: vi
      .fn()
      .mockReturnValue({ idle: 0, busy: 1, total: 1, maxTotal: 3 }),
  };
}

function makeCtx(
  pool?: ContainerPool | null,
  codeAgent?: ToolContext["config"]["sandbox"]["codeAgent"],
): ToolContext {
  return {
    config: {
      sandbox: {
        runtime: "docker",
        defaults: { timeout: 120, memoryLimit: "1g", cpuLimit: "2.0" },
        codeAgent: codeAgent ?? {
          command: "claude-code",
          args: ["--no-interactive"],
          env: { ANTHROPIC_API_KEY: "sk-test" },
        },
      },
      security: { maxConcurrentSandboxes: 3 },
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
    pool: pool === null ? undefined : (pool ?? mockPool()),
  };
}

describe("opencodeTool", () => {
  it("should execute code agent with task and return success", async () => {
    const container = mockContainer();
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    const result = await opencodeTool.execute({ task: "fix the bug" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Task completed successfully.");
    expect(result.output).toContain("Exit code: 0");
    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "trusted" }),
    );
  });

  it("should assemble command with args and shell-escaped task", async () => {
    const container = mockContainer();
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    await opencodeTool.execute({ task: "fix the bug" }, ctx);

    expect(container.exec).toHaveBeenCalledWith(
      expect.stringContaining("claude-code"),
      expect.anything(),
    );
    const cmd = (container.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(cmd).toContain("--no-interactive");
    expect(cmd).toContain("fix the bug");
  });

  it("should return error when codeAgent is not configured", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool, undefined);
    // Override to remove codeAgent
    (ctx.config.sandbox as { codeAgent?: unknown }).codeAgent = undefined;

    const result = await opencodeTool.execute({ task: "do something" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("codeAgent is not configured");
  });

  it("should return error when pool is not available", async () => {
    const ctx = makeCtx(null);

    const result = await opencodeTool.execute({ task: "do something" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("Sandbox pool is not available");
  });

  it("should use trusted trust level by default", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);

    await opencodeTool.execute({ task: "test" }, ctx);

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "trusted" }),
    );
  });

  it("should pass sandboxed trust level when specified", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);

    await opencodeTool.execute({ task: "test", trust: "sandboxed" }, ctx);

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "sandboxed" }),
    );
  });

  it("should release container after execution", async () => {
    const container = mockContainer();
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    await opencodeTool.execute({ task: "test" }, ctx);

    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should release container even on exec error", async () => {
    const container = mockContainer({
      exec: vi.fn().mockRejectedValue(new Error("exec failed")),
    });
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    const result = await opencodeTool.execute({ task: "test" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toBe("exec failed");
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should include stderr in output when present", async () => {
    const container = mockContainer({
      exec: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "partial output",
        stderr: "something went wrong",
      }),
    });
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    const result = await opencodeTool.execute({ task: "test" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("partial output");
    expect(result.output).toContain("[stderr]");
    expect(result.output).toContain("something went wrong");
    expect(result.output).toContain("Exit code: 1");
  });

  it("should return error when acquire fails", async () => {
    const pool = mockPool();
    (pool.acquire as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Pool limit reached"),
    );
    const ctx = makeCtx(pool);

    const result = await opencodeTool.execute({ task: "test" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("Failed to acquire container");
    expect(result.output).toContain("Pool limit reached");
  });

  it("should use custom timeout when specified", async () => {
    const container = mockContainer();
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    await opencodeTool.execute({ task: "test", timeout: 60 }, ctx);

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 60 }),
    );
    expect(container.exec).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 60 }),
    );
  });
});
