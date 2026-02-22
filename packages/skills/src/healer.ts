import type { SkillRunResult } from "@augure/types";
import type { SkillManager } from "./manager.js";
import type { SkillGenerator } from "./generator.js";
import type { SkillTester } from "./tester.js";
import { FileSkillState } from "./state.js";
import { join } from "node:path";

export interface SkillHealerConfig {
  manager: SkillManager;
  generator: SkillGenerator;
  tester: SkillTester;
  maxAttempts: number;
  skillsPath: string;
}

export interface HealResult {
  healed: boolean;
  paused: boolean;
  error?: string;
}

export class SkillHealer {
  private readonly stateCache = new Map<string, FileSkillState>();

  constructor(private readonly config: SkillHealerConfig) {}

  /** Called after each skill run to check for failures and trigger healing */
  async onRunComplete(result: SkillRunResult): Promise<HealResult> {
    if (result.success) {
      // Reset failure counter on success
      const state = this.getState(result.skillId);
      await state.set("consecutive-failures", "0");
      return { healed: false, paused: false };
    }

    // Track consecutive failures
    const state = this.getState(result.skillId);
    const raw = await state.get("consecutive-failures");
    const failures = (raw ? parseInt(raw, 10) : 0) + 1;
    await state.set("consecutive-failures", String(failures));

    if (failures >= this.config.maxAttempts) {
      await this.config.manager.updateStatus(result.skillId, "paused");
      return { healed: false, paused: true, error: `Paused after ${failures} consecutive failures` };
    }

    // Attempt healing
    return this.heal(result.skillId, result.error ?? "Unknown error");
  }

  /** Attempt to heal a broken skill */
  async heal(skillId: string, error?: string): Promise<HealResult> {
    const skill = await this.config.manager.get(skillId);
    const healError = error ?? (await this.config.manager.getLastRun(skillId))?.error ?? "Unknown error";

    // Ask LLM to regenerate code
    const fixed = await this.config.generator.regenerateCode(skill, healError);
    if (!fixed) {
      await this.config.manager.updateStatus(skillId, "broken");
      return { healed: false, paused: false, error: "LLM could not generate a fix" };
    }

    // Update skill with fixed code
    skill.code = fixed.code;
    skill.testCode = fixed.testCode;

    // Test the fix
    const testResult = await this.config.tester.test(skill);
    if (!testResult.success) {
      await this.config.manager.updateStatus(skillId, "broken");
      return { healed: false, paused: false, error: `Fix failed tests: ${testResult.error}` };
    }

    // Success — save, bump version, activate
    await this.config.manager.save(skill);
    await this.config.manager.bumpVersion(skillId);
    await this.config.manager.updateStatus(skillId, "active");

    // Reset failure counter
    const state = this.getState(skillId);
    await state.set("consecutive-failures", "0");

    return { healed: true, paused: false };
  }

  /** Check if a skill needs healing based on recent runs */
  async needsHealing(skillId: string): Promise<boolean> {
    const lastRun = await this.config.manager.getLastRun(skillId);
    if (!lastRun) return false;
    return !lastRun.success;
  }

  private getState(skillId: string): FileSkillState {
    let state = this.stateCache.get(skillId);
    if (!state) {
      state = new FileSkillState(
        join(this.config.skillsPath, skillId, "state.json"),
      );
      this.stateCache.set(skillId, state);
    }
    return state;
  }
}
