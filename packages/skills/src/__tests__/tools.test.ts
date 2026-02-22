import { describe, it, expect, vi } from "vitest";
import { createSkillTools } from "../tools.js";
import type { SkillManager } from "../manager.js";
import type { SkillRunner } from "../runner.js";
import type { SkillGenerator } from "../generator.js";
import type { SkillHealer } from "../healer.js";
import type { SkillHub } from "../hub.js";
import type { NativeTool, ToolContext } from "@augure/types";

function mockDeps() {
  return {
    manager: {
      list: vi.fn().mockResolvedValue([
        { id: "test", name: "Test Skill", version: 1, status: "active", trigger: { type: "cron", schedule: "0 8 * * *" }, tags: ["test"], updated: "" },
      ]),
      get: vi.fn().mockResolvedValue({ meta: { id: "test" }, body: "test" }),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as SkillManager,
    runner: {
      run: vi.fn().mockResolvedValue({ skillId: "test", success: true, output: "done", timestamp: "", durationMs: 100 }),
    } as unknown as SkillRunner,
    generator: {
      generate: vi.fn().mockResolvedValue({
        success: true,
        skill: { meta: { id: "new-skill", name: "New Skill", status: "draft" }, body: "body", code: "code", testCode: "test" },
      }),
    } as unknown as SkillGenerator,
    healer: {
      onRunComplete: vi.fn().mockResolvedValue({ healed: false, paused: false }),
    } as unknown as SkillHealer,
    hub: {
      download: vi.fn().mockResolvedValue({ meta: { id: "hub-skill", name: "Hub Skill" }, body: "hub body" }),
    } as unknown as SkillHub,
  };
}

const ctx = {} as ToolContext;

function findTool(tools: NativeTool[], name: string): NativeTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

describe("createSkillTools", () => {
  it("should return 5 tools", () => {
    const tools = createSkillTools(mockDeps());
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "create_skill", "list_skills", "run_skill", "manage_skill", "install_skill",
    ]);
  });
});

describe("create_skill", () => {
  it("should generate and save a skill", async () => {
    const deps = mockDeps();
    const tools = createSkillTools(deps);
    const tool = findTool(tools, "create_skill");

    const result = await tool.execute({ description: "daily report", trigger_type: "cron", schedule: "0 8 * * *" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("New Skill");
    expect(deps.generator.generate).toHaveBeenCalled();
    expect(deps.manager.save).toHaveBeenCalled();
  });

  it("should return error when generation fails", async () => {
    const deps = mockDeps();
    (deps.generator.generate as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: "LLM error" });
    const tool = findTool(createSkillTools(deps), "create_skill");

    const result = await tool.execute({ description: "test", trigger_type: "manual" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("LLM error");
  });
});

describe("list_skills", () => {
  it("should list skills with status", async () => {
    const deps = mockDeps();
    const tool = findTool(createSkillTools(deps), "list_skills");

    const result = await tool.execute({}, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Test Skill");
    expect(result.output).toContain("active");
    expect(result.output).toContain("cron");
  });

  it("should handle empty list", async () => {
    const deps = mockDeps();
    (deps.manager.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const tool = findTool(createSkillTools(deps), "list_skills");

    const result = await tool.execute({}, ctx);

    expect(result.output).toContain("No skills");
  });
});

describe("run_skill", () => {
  it("should run a skill and return result", async () => {
    const deps = mockDeps();
    const tool = findTool(createSkillTools(deps), "run_skill");

    const result = await tool.execute({ id: "test" }, ctx);

    expect(result.success).toBe(true);
    expect(deps.runner.run).toHaveBeenCalledWith("test");
    expect(deps.healer.onRunComplete).toHaveBeenCalled();
  });

  it("should return error for non-existent skill", async () => {
    const deps = mockDeps();
    (deps.manager.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const tool = findTool(createSkillTools(deps), "run_skill");

    const result = await tool.execute({ id: "nope" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("not found");
  });
});

describe("manage_skill", () => {
  it("should pause a skill", async () => {
    const deps = mockDeps();
    const tool = findTool(createSkillTools(deps), "manage_skill");

    const result = await tool.execute({ id: "test", action: "pause" }, ctx);

    expect(result.success).toBe(true);
    expect(deps.manager.updateStatus).toHaveBeenCalledWith("test", "paused");
  });

  it("should resume a skill", async () => {
    const deps = mockDeps();
    const tool = findTool(createSkillTools(deps), "manage_skill");

    const result = await tool.execute({ id: "test", action: "resume" }, ctx);

    expect(result.success).toBe(true);
    expect(deps.manager.updateStatus).toHaveBeenCalledWith("test", "active");
  });

  it("should delete a skill", async () => {
    const deps = mockDeps();
    const tool = findTool(createSkillTools(deps), "manage_skill");

    const result = await tool.execute({ id: "test", action: "delete" }, ctx);

    expect(result.success).toBe(true);
    expect(deps.manager.delete).toHaveBeenCalledWith("test");
  });
});

describe("install_skill", () => {
  it("should install from hub", async () => {
    const deps = mockDeps();
    const tool = findTool(createSkillTools(deps), "install_skill");

    const result = await tool.execute({ skill_id: "hub-skill" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Hub Skill");
    expect(deps.hub!.download).toHaveBeenCalledWith("hub-skill");
    expect(deps.manager.save).toHaveBeenCalled();
  });

  it("should return error when hub not configured", async () => {
    const deps = mockDeps();
    (deps as { hub: SkillHub | undefined }).hub = undefined;
    const tool = findTool(createSkillTools(deps), "install_skill");

    const result = await tool.execute({ skill_id: "test" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("not configured");
  });
});
