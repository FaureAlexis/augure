import { describe, it, expect, vi } from "vitest";
import { SkillTester } from "../tester.js";
import type { Container, ContainerPool, Skill } from "@augure/types";

function mockContainer(overrides: Partial<Container> = {}): Container {
  return {
    id: "test-container",
    status: "idle",
    exec: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "TAP version 13\n# pass 2\n# fail 0\n# tests 2\n",
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

const testSkill: Skill = {
  meta: {
    id: "test-skill", name: "Test", version: 1,
    created: "", updated: "", status: "testing",
    trigger: { type: "manual" }, sandbox: true, tools: [], tags: [],
  },
  body: "Test skill",
  code: "export default async () => ({ output: 'ok' })",
  testCode: 'import { describe, it } from "node:test";\ndescribe("test", () => { it("works", () => {}); });',
};

describe("SkillTester", () => {
  it("should return success when tests pass", async () => {
    const container = mockContainer();
    const pool = mockPool(container);
    const tester = new SkillTester({
      pool,
      defaults: { timeout: 60, memoryLimit: "256m", cpuLimit: "0.5" },
    });

    const result = await tester.test(testSkill);

    expect(result.success).toBe(true);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should return failure when tests fail", async () => {
    const container = mockContainer({
      exec: vi.fn()
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write skill
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write test
        .mockResolvedValue({
          exitCode: 1,
          stdout: "# pass 1\n# fail 2\n# tests 3\n",
          stderr: "AssertionError: expected true to be false",
        }),
    });
    const pool = mockPool(container);
    const tester = new SkillTester({
      pool,
      defaults: { timeout: 60, memoryLimit: "256m", cpuLimit: "0.5" },
    });

    const result = await tester.test(testSkill);

    expect(result.success).toBe(false);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.error).toBeDefined();
  });

  it("should return error when skill has no test code", async () => {
    const tester = new SkillTester({
      pool: mockPool(),
      defaults: { timeout: 60, memoryLimit: "256m", cpuLimit: "0.5" },
    });

    const result = await tester.test({ ...testSkill, testCode: undefined });

    expect(result.success).toBe(false);
    expect(result.error).toContain("no test code");
  });

  it("should return error when skill has no code", async () => {
    const tester = new SkillTester({
      pool: mockPool(),
      defaults: { timeout: 60, memoryLimit: "256m", cpuLimit: "0.5" },
    });

    const result = await tester.test({ ...testSkill, code: undefined });

    expect(result.success).toBe(false);
    expect(result.error).toContain("no code");
  });

  it("should return error when acquire fails", async () => {
    const pool = mockPool();
    (pool.acquire as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("No containers"));
    const tester = new SkillTester({
      pool,
      defaults: { timeout: 60, memoryLimit: "256m", cpuLimit: "0.5" },
    });

    const result = await tester.test(testSkill);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to acquire");
  });

  it("should release container even on exec error", async () => {
    const container = mockContainer({
      exec: vi.fn()
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write skill
        .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // write test
        .mockRejectedValue(new Error("Container crashed")),
    });
    const pool = mockPool(container);
    const tester = new SkillTester({
      pool,
      defaults: { timeout: 60, memoryLimit: "256m", cpuLimit: "0.5" },
    });

    const result = await tester.test(testSkill);

    expect(result.success).toBe(false);
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should always use sandboxed trust level", async () => {
    const pool = mockPool();
    const tester = new SkillTester({
      pool,
      defaults: { timeout: 60, memoryLimit: "256m", cpuLimit: "0.5" },
    });

    await tester.test(testSkill);

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "sandboxed" }),
    );
  });
});
