import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillUpdater } from "../updater.js";
import type { SkillManager } from "../manager.js";
import type { SkillHub } from "../hub.js";
import type { SkillTester } from "../tester.js";
import type { Skill, SkillIndexEntry } from "@augure/types";

function makeMeta(id: string, version: number) {
  return {
    id,
    name: id,
    version,
    created: "2025-01-01",
    updated: "2025-01-01",
    status: "active" as const,
    trigger: { type: "manual" as const },
    sandbox: true,
    tools: [],
    tags: [],
  };
}

function makeSkill(id: string, version: number): Skill {
  return {
    meta: makeMeta(id, version),
    body: "# Test",
    code: "export default async () => ({ output: 'ok' })",
    testCode: "import { it } from 'node:test'; it('works', () => {})",
  };
}

function makeIndexEntry(id: string, version: number): SkillIndexEntry {
  return {
    id,
    name: id,
    version,
    status: "active",
    trigger: { type: "manual" },
    tags: [],
    updated: "2025-01-01",
  };
}

describe("SkillUpdater", () => {
  let manager: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    bumpVersion: ReturnType<typeof vi.fn>;
  };
  let hub: {
    list: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  let tester: {
    test: ReturnType<typeof vi.fn>;
  };
  let updater: SkillUpdater;

  beforeEach(() => {
    manager = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      bumpVersion: vi.fn().mockResolvedValue(2),
    };
    hub = {
      list: vi.fn().mockResolvedValue([]),
      download: vi.fn(),
    };
    tester = {
      test: vi.fn().mockResolvedValue({ success: true, passed: 1, failed: 0, output: "ok" }),
    };
    updater = new SkillUpdater({
      manager: manager as unknown as SkillManager,
      hub: hub as unknown as SkillHub,
      tester: tester as unknown as SkillTester,
    });
  });

  describe("checkForUpdates", () => {
    it("should return empty when no updates available", async () => {
      manager.list.mockResolvedValue([makeIndexEntry("skill-a", 2)]);
      hub.list.mockResolvedValue([{ id: "skill-a", name: "A", description: "A", version: 2 }]);

      const result = await updater.checkForUpdates();
      expect(result).toEqual([]);
    });

    it("should detect outdated skills", async () => {
      manager.list.mockResolvedValue([makeIndexEntry("skill-a", 1)]);
      hub.list.mockResolvedValue([{ id: "skill-a", name: "A", description: "A", version: 3 }]);

      const result = await updater.checkForUpdates();
      expect(result).toEqual([{ id: "skill-a", localVersion: 1, hubVersion: 3 }]);
    });

    it("should ignore skills not installed locally", async () => {
      manager.list.mockResolvedValue([]);
      hub.list.mockResolvedValue([{ id: "new-skill", name: "New", description: "New", version: 1 }]);

      const result = await updater.checkForUpdates();
      expect(result).toEqual([]);
    });
  });

  describe("applyUpdate", () => {
    it("should backup, download, test, and save on success", async () => {
      const oldSkill = makeSkill("skill-a", 1);
      const newSkill = makeSkill("skill-a", 2);
      manager.get.mockResolvedValue(oldSkill);
      hub.download.mockResolvedValue(newSkill);
      tester.test.mockResolvedValue({ success: true, passed: 1, failed: 0, output: "ok" });

      const result = await updater.applyUpdate("skill-a");

      expect(hub.download).toHaveBeenCalledWith("skill-a");
      expect(tester.test).toHaveBeenCalledWith(newSkill);
      expect(manager.save).toHaveBeenCalledWith(newSkill);
      expect(result.success).toBe(true);
    });

    it("should reject downloaded skill with sandbox disabled", async () => {
      const oldSkill = makeSkill("skill-a", 1);
      const newSkill = makeSkill("skill-a", 2);
      newSkill.meta.sandbox = false;
      manager.get.mockResolvedValue(oldSkill);
      hub.download.mockResolvedValue(newSkill);

      const result = await updater.applyUpdate("skill-a");

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.error).toContain("sandbox disabled");
      expect(tester.test).not.toHaveBeenCalled();
    });

    it("should rollback to backup when tests fail", async () => {
      const oldSkill = makeSkill("skill-a", 1);
      const newSkill = makeSkill("skill-a", 2);
      manager.get.mockResolvedValue(oldSkill);
      hub.download.mockResolvedValue(newSkill);
      tester.test.mockResolvedValue({ success: false, passed: 0, failed: 1, output: "", error: "fail" });

      const result = await updater.applyUpdate("skill-a");

      // Should save back the old skill (rollback)
      expect(manager.save).toHaveBeenLastCalledWith(oldSkill);
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
    });
  });

  describe("checkAndApply", () => {
    it("should check and apply all available updates", async () => {
      manager.list.mockResolvedValue([makeIndexEntry("skill-a", 1)]);
      hub.list.mockResolvedValue([{ id: "skill-a", name: "A", description: "A", version: 2 }]);
      const oldSkill = makeSkill("skill-a", 1);
      const newSkill = makeSkill("skill-a", 2);
      manager.get.mockResolvedValue(oldSkill);
      hub.download.mockResolvedValue(newSkill);

      const results = await updater.checkAndApply();

      expect(results).toHaveLength(1);
      expect(results[0].skillId).toBe("skill-a");
      expect(results[0].success).toBe(true);
    });

    it("should return empty array when no updates", async () => {
      manager.list.mockResolvedValue([]);
      hub.list.mockResolvedValue([]);

      const results = await updater.checkAndApply();
      expect(results).toEqual([]);
    });
  });
});
