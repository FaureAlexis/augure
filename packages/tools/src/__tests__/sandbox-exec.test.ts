import { describe, it, expect, vi } from "vitest";
import { sandboxExecTool } from "../sandbox-exec.js";
import type {
  ToolContext,
  MemoryStore,
  Scheduler,
  Container,
  ContainerPool,
} from "@augure/types";

function mockContainer(
  overrides?: Partial<Container>,
): Container {
  return {
    id: "test-container",
    status: "idle",
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "hello world\n", stderr: "" }),
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
    stats: vi.fn().mockReturnValue({ idle: 0, busy: 1, total: 1, maxTotal: 3 }),
  };
}

function makeCtx(pool?: ContainerPool): ToolContext {
  return {
    config: {
      sandbox: {
        runtime: "docker",
        defaults: { timeout: 30, memoryLimit: "256m", cpuLimit: "0.5" },
      },
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
    pool,
  };
}

describe("sandboxExecTool", () => {
  it("should execute command and return stdout with exit code 0", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);

    const result = await sandboxExecTool.execute({ command: "echo hello" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("hello world\n");
    expect(result.output).toContain("Exit code: 0");
  });

  it("should forward trust level to pool.acquire", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);

    await sandboxExecTool.execute({ command: "curl example.com", trust: "trusted" }, ctx);

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "trusted" }),
    );
  });

  it("should return error when pool is not available", async () => {
    const ctx = makeCtx(undefined);

    const result = await sandboxExecTool.execute({ command: "echo hi" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("Sandbox pool is not available");
  });

  it("should report non-zero exit code as failure", async () => {
    const container = mockContainer({
      exec: vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "not found\n" }),
    });
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    const result = await sandboxExecTool.execute({ command: "ls /nope" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("[stderr]");
    expect(result.output).toContain("not found");
    expect(result.output).toContain("Exit code: 1");
  });

  it("should release container even on error", async () => {
    const container = mockContainer({
      exec: vi.fn().mockRejectedValue(new Error("exec timeout")),
    });
    const pool = mockPool(container);
    const ctx = makeCtx(pool);

    const result = await sandboxExecTool.execute({ command: "sleep 999" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("exec timeout");
    expect(pool.release).toHaveBeenCalledWith(container);
  });
});
