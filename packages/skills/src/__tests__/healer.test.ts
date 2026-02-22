import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillHealer } from "../healer.js";
import type { SkillManager } from "../manager.js";
import type { SkillGenerator } from "../generator.js";
import type { SkillTester } from "../tester.js";
import type { Skill, SkillTestResult } from "@augure/types";

const testSkill: Skill = {
  meta: {
    id: "test-skill", name: "Test", version: 1,
    created: "", updated: "", status: "active",
    trigger: { type: "manual" }, sandbox: true, tools: [], tags: [],
  },
  body: "Test skill",
  code: "export default async () => ({ output: 'ok' })",
  testCode: "test code",
};

function mockManager(): SkillManager {
  return {
    get: vi.fn().mockResolvedValue(testSkill),
    save: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    bumpVersion: vi.fn().mockResolvedValue(2),
    getLastRun: vi.fn().mockResolvedValue({ success: false, error: "some error" }),
    getRuns: vi.fn().mockResolvedValue([]),
  } as unknown as SkillManager;
}

function mockGenerator(fixResult: { code: string; testCode: string } | null = { code: "fixed", testCode: "fixed test" }): SkillGenerator {
  return {
    regenerateCode: vi.fn().mockResolvedValue(fixResult),
  } as unknown as SkillGenerator;
}

function mockTester(result: Partial<SkillTestResult> = { success: true, passed: 1, failed: 0, output: "ok" }): SkillTester {
  return {
    test: vi.fn().mockResolvedValue(result),
  } as unknown as SkillTester;
}

let skillsPath: string;

beforeEach(async () => {
  skillsPath = await mkdtemp(join(tmpdir(), "healer-"));
});

describe("SkillHealer", () => {
  it("should reset failure counter on successful run", async () => {
    const healer = new SkillHealer({
      manager: mockManager(),
      generator: mockGenerator(),
      tester: mockTester(),
      maxAttempts: 3,
      skillsPath,
    });

    const result = await healer.onRunComplete({
      skillId: "test-skill", timestamp: new Date().toISOString(),
      success: true, output: "ok", durationMs: 100,
    });

    expect(result.healed).toBe(false);
    expect(result.paused).toBe(false);
  });

  it("should heal on first failure when LLM fix succeeds", async () => {
    const manager = mockManager();
    const generator = mockGenerator({ code: "fixed code", testCode: "fixed test" });
    const tester = mockTester({ success: true, passed: 1, failed: 0, output: "ok" });
    const healer = new SkillHealer({
      manager, generator, tester, maxAttempts: 3, skillsPath,
    });

    const result = await healer.onRunComplete({
      skillId: "test-skill", timestamp: new Date().toISOString(),
      success: false, error: "TypeError: x is undefined", durationMs: 100,
    });

    expect(result.healed).toBe(true);
    expect(result.paused).toBe(false);
    expect(manager.save).toHaveBeenCalled();
    expect(manager.bumpVersion).toHaveBeenCalledWith("test-skill");
    expect(manager.updateStatus).toHaveBeenCalledWith("test-skill", "active");
  });

  it("should mark as broken when LLM cannot fix", async () => {
    const manager = mockManager();
    const healer = new SkillHealer({
      manager,
      generator: mockGenerator(null),
      tester: mockTester(),
      maxAttempts: 3,
      skillsPath,
    });

    const result = await healer.onRunComplete({
      skillId: "test-skill", timestamp: new Date().toISOString(),
      success: false, error: "error", durationMs: 100,
    });

    expect(result.healed).toBe(false);
    expect(manager.updateStatus).toHaveBeenCalledWith("test-skill", "broken");
  });

  it("should mark as broken when fix fails tests", async () => {
    const manager = mockManager();
    const healer = new SkillHealer({
      manager,
      generator: mockGenerator({ code: "bad fix", testCode: "bad test" }),
      tester: mockTester({ success: false, passed: 0, failed: 1, output: "", error: "test failed" }),
      maxAttempts: 3,
      skillsPath,
    });

    const result = await healer.onRunComplete({
      skillId: "test-skill", timestamp: new Date().toISOString(),
      success: false, error: "error", durationMs: 100,
    });

    expect(result.healed).toBe(false);
    expect(result.error).toContain("Fix failed tests");
  });

  it("should pause skill after maxAttempts consecutive failures", async () => {
    const manager = mockManager();
    const healer = new SkillHealer({
      manager,
      generator: mockGenerator(null),
      tester: mockTester(),
      maxAttempts: 3,
      skillsPath,
    });

    const failResult = {
      skillId: "test-skill", timestamp: new Date().toISOString(),
      success: false as const, error: "error", durationMs: 100,
    };

    // Simulate 3 failures
    await healer.onRunComplete(failResult);
    await healer.onRunComplete(failResult);
    const result = await healer.onRunComplete(failResult);

    expect(result.paused).toBe(true);
    expect(manager.updateStatus).toHaveBeenCalledWith("test-skill", "paused");
  });

  it("should report needsHealing correctly", async () => {
    const manager = mockManager();
    const healer = new SkillHealer({
      manager,
      generator: mockGenerator(),
      tester: mockTester(),
      maxAttempts: 3,
      skillsPath,
    });

    expect(await healer.needsHealing("test-skill")).toBe(true);

    (manager.getLastRun as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    expect(await healer.needsHealing("test-skill")).toBe(false);

    (manager.getLastRun as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await healer.needsHealing("test-skill")).toBe(false);
  });
});
