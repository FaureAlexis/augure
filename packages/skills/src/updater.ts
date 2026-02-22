import type { SkillManager } from "./manager.js";
import type { SkillHub } from "./hub.js";
import type { SkillTester } from "./tester.js";
import type { Skill } from "@augure/types";

export interface SkillUpdaterConfig {
  manager: SkillManager;
  hub: SkillHub;
  tester: SkillTester;
}

export interface SkillUpdateInfo {
  id: string;
  localVersion: number;
  hubVersion: number;
}

export interface SkillUpdateResult {
  skillId: string;
  success: boolean;
  rolledBack?: boolean;
  fromVersion: number;
  toVersion: number;
  error?: string;
}

export class SkillUpdater {
  constructor(private readonly config: SkillUpdaterConfig) {}

  /** Compare local skill versions with hub manifest */
  async checkForUpdates(): Promise<SkillUpdateInfo[]> {
    const [local, remote] = await Promise.all([
      this.config.manager.list(),
      this.config.hub.list(),
    ]);

    const localMap = new Map(local.map((s) => [s.id, s.version]));
    const updates: SkillUpdateInfo[] = [];

    for (const entry of remote) {
      const localVersion = localMap.get(entry.id);
      if (localVersion !== undefined && entry.version > localVersion) {
        updates.push({
          id: entry.id,
          localVersion,
          hubVersion: entry.version,
        });
      }
    }

    return updates;
  }

  /** Apply a single skill update with backup and rollback */
  async applyUpdate(skillId: string): Promise<SkillUpdateResult> {
    // 1. Backup current version
    let backup: Skill;
    try {
      backup = await this.config.manager.get(skillId);
    } catch (err) {
      return {
        skillId,
        success: false,
        fromVersion: 0,
        toVersion: 0,
        error: `Failed to backup: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const fromVersion = backup.meta.version;

    // 2. Download new version from hub
    let newSkill: Skill;
    try {
      newSkill = await this.config.hub.download(skillId);
    } catch (err) {
      return {
        skillId,
        success: false,
        fromVersion,
        toVersion: 0,
        error: `Failed to download: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const toVersion = newSkill.meta.version;

    // 3. Test the new version
    const testResult = await this.config.tester.test(newSkill);

    if (testResult.success) {
      // 4a. Tests pass → save new version
      await this.config.manager.save(newSkill);
      return { skillId, success: true, fromVersion, toVersion };
    }

    // 4b. Tests fail → rollback to backup
    await this.config.manager.save(backup);
    return {
      skillId,
      success: false,
      rolledBack: true,
      fromVersion,
      toVersion,
      error: `Update failed tests: ${testResult.error ?? "unknown"}`,
    };
  }

  /** Check for updates and apply all available ones */
  async checkAndApply(): Promise<SkillUpdateResult[]> {
    const updates = await this.checkForUpdates();
    const results: SkillUpdateResult[] = [];

    for (const update of updates) {
      try {
        const result = await this.applyUpdate(update.id);
        results.push(result);
      } catch (err) {
        results.push({
          skillId: update.id,
          success: false,
          fromVersion: update.localVersion,
          toVersion: update.hubVersion,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }
}
