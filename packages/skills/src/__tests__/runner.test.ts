import { describe, it, expect, vi } from "vitest";
import { SkillRunner } from "../runner.js";
import type { Container, ContainerPool } from "@augure/types";
import type { SkillManager } from "../manager.js";

function mockContainer(overrides: Partial<Container> = {}): Container {
  return {
    id: "test-container",
    status: "idle",
    exec: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ success: true, output: "done" }),
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
    stats: vi.fn().mockReturnValue({ idle: 0, busy: 1, total: 1, maxTotal: 3 }),
  };
}

function mockManager(): SkillManager {
  return {
    get: vi.fn().mockResolvedValue({
      meta: {
        id: "test-skill",
        name: "Test",
        version: 1,
        created: "",
        updated: "",
        status: "active",
        trigger: { type: "manual" },
        sandbox: true,
        tools: [],
        tags: [],
      },
      body: "Test skill",
      code: 'export default async function(ctx) { return { output: "ok" }; }',
      testCode: "test code",
    }),
    getLastRun: vi.fn().mockResolvedValue(null),
    saveRun: vi.fn().mockResolvedValue(undefined),
  } as unknown as SkillManager;
}

describe("SkillRunner", () => {
  it("should execute a skill and return success", async () => {
    const container = mockContainer();
    const pool = mockPool(container);
    const manager = mockManager();
    const runner = new SkillRunner({
      pool,
      manager,
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    const result = await runner.run("test-skill");

    expect(result.success).toBe(true);
    expect(result.output).toBe("done");
    expect(result.skillId).toBe("test-skill");
    expect(pool.acquire).toHaveBeenCalled();
    expect(pool.release).toHaveBeenCalledWith(container);
    expect(manager.saveRun).toHaveBeenCalled();
  });

  it("should return error when skill has no code", async () => {
    const manager = mockManager();
    (manager.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meta: { id: "test", name: "Test", version: 1, created: "", updated: "", status: "active", trigger: { type: "manual" }, sandbox: true, tools: [], tags: [] },
      body: "No code skill",
    });
    const runner = new SkillRunner({
      pool: mockPool(),
      manager,
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    const result = await runner.run("test");

    expect(result.success).toBe(false);
    expect(result.error).toContain("no code");
  });

  it("should return error when acquire fails", async () => {
    const pool = mockPool();
    (pool.acquire as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Pool full"));
    const runner = new SkillRunner({
      pool,
      manager: mockManager(),
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    const result = await runner.run("test-skill");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to acquire");
  });

  it("should release container even on exec error", async () => {
    const container = mockContainer({
      exec: vi.fn()
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write skill
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write config
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write harness
        .mockRejectedValue(new Error("exec crashed")),
    });
    const pool = mockPool(container);
    const runner = new SkillRunner({
      pool,
      manager: mockManager(),
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    const result = await runner.run("test-skill");

    expect(result.success).toBe(false);
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should handle non-zero exit code", async () => {
    const container = mockContainer({
      exec: vi.fn()
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write skill
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write config
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write harness
        .mockResolvedValue({ exitCode: 1, stdout: "", stderr: "Runtime error" }),
    });
    const pool = mockPool(container);
    const runner = new SkillRunner({
      pool,
      manager: mockManager(),
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    const result = await runner.run("test-skill");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Runtime error");
  });

  it("should use sandboxed trust for sandbox skills", async () => {
    const pool = mockPool();
    const runner = new SkillRunner({
      pool,
      manager: mockManager(),
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    await runner.run("test-skill");

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "sandboxed" }),
    );
  });

  it("should use trusted trust for non-sandbox skills", async () => {
    const manager = mockManager();
    (manager.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      meta: { id: "test", name: "Test", version: 1, created: "", updated: "", status: "active", trigger: { type: "manual" }, sandbox: false, tools: [], tags: [] },
      body: "Trusted skill",
      code: "export default async () => ({ output: 'ok' })",
    });
    const pool = mockPool();
    const runner = new SkillRunner({
      pool,
      manager,
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    await runner.run("test");

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "trusted" }),
    );
  });

  it("should record durationMs in result", async () => {
    const pool = mockPool();
    const runner = new SkillRunner({
      pool,
      manager: mockManager(),
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    const result = await runner.run("test-skill");

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("SkillRunner with browserManager", () => {
  it("should accept browserManager in config", () => {
    const mockBrowserManager = {
      open: vi.fn().mockResolvedValue("s_test"),
      navigate: vi.fn().mockResolvedValue(undefined),
      act: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
      extract: vi.fn().mockResolvedValue({ data: "test" }),
      observe: vi.fn().mockResolvedValue([]),
      screenshot: vi.fn().mockResolvedValue("base64"),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const runner = new SkillRunner({
      pool: mockPool(),
      manager: mockManager(),
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
      browserManager: mockBrowserManager,
    });

    expect(runner).toBeDefined();
  });

  it("should work without browserManager (backward compatible)", () => {
    const runner = new SkillRunner({
      pool: mockPool(),
      manager: mockManager(),
      defaults: { timeout: 120, memoryLimit: "512m", cpuLimit: "1.0" },
    });

    expect(runner).toBeDefined();
  });
});
