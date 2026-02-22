import type { Scheduler, Logger } from "@augure/types";
import { noopLogger } from "@augure/types";
import type { SkillManager } from "./manager.js";

const JOB_PREFIX = "skill:";

export class SkillSchedulerBridge {
  private readonly log: Logger;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly manager: SkillManager,
    logger?: Logger,
  ) {
    this.log = logger ?? noopLogger;
  }

  /** Register cron jobs for all active cron-triggered skills */
  async syncAll(): Promise<void> {
    const skills = await this.manager.list();
    const existingJobs = new Set(
      this.scheduler.listJobs()
        .filter((j: { id: string }) => j.id.startsWith(JOB_PREFIX))
        .map((j: { id: string }) => j.id),
    );

    for (const skill of skills) {
      const jobId = `${JOB_PREFIX}${skill.id}`;

      if (skill.status === "active" && skill.trigger.type === "cron" && skill.trigger.schedule) {
        if (!existingJobs.has(jobId)) {
          try {
            this.scheduler.addJob({
              id: jobId,
              cron: skill.trigger.schedule,
              prompt: `[skill:run:${skill.id}]`,
              channel: skill.trigger.channel ?? "default",
              enabled: true,
            });
          } catch (err) {
            this.log.error(`Failed to register cron for ${skill.id}:`, err);
          }
        }
        existingJobs.delete(jobId);
      }
    }

    // Remove orphaned skill jobs
    for (const orphanId of existingJobs) {
      this.scheduler.removeJob(orphanId);
    }
  }

  /** Register a single skill as a cron job */
  register(skillId: string, schedule: string, channel?: string): void {
    const jobId = `${JOB_PREFIX}${skillId}`;
    // Remove existing if any
    try {
      this.scheduler.removeJob(jobId);
    } catch { /* ignore if not found */ }

    this.scheduler.addJob({
      id: jobId,
      cron: schedule,
      prompt: `[skill:run:${skillId}]`,
      channel: channel ?? "default",
      enabled: true,
    });
  }

  /** Unregister a skill's cron job */
  unregister(skillId: string): void {
    try {
      this.scheduler.removeJob(`${JOB_PREFIX}${skillId}`);
    } catch { /* ignore if not found */ }
  }

  /** Check if a prompt is a skill run command, return skill ID if so */
  static parseSkillPrompt(prompt: string): string | null {
    const match = prompt.match(/^\[skill:run:(.+)\]$/);
    return match ? match[1] : null;
  }
}
