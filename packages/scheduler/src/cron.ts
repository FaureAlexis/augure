import { createTask, validate, type ScheduledTask } from "node-cron";
import type { Job, Scheduler } from "@augure/types";
import type { JobStore } from "./jobs.js";

type JobTriggerHandler = (job: Job) => void | Promise<void>;

export class CronScheduler implements Scheduler {
  private jobs = new Map<string, Job>();
  private tasks = new Map<string, ScheduledTask>();
  private handlers: JobTriggerHandler[] = [];
  private persistChain: Promise<void> = Promise.resolve();

  constructor(private readonly store?: JobStore) {}

  onJobTrigger(handler: JobTriggerHandler): void {
    this.handlers.push(handler);
  }

  addJob(job: Job): void {
    if (!validate(job.cron)) {
      throw new Error(`Invalid cron expression: ${job.cron}`);
    }

    this.jobs.set(job.id, job);

    if (job.enabled) {
      const task = createTask(job.cron, () => {
        void this.executeHandlers(job);
      });
      this.tasks.set(job.id, task);
    }

    this.persist();
  }

  removeJob(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
    }
    this.jobs.delete(id);
    this.persist();
  }

  listJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  async triggerJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }
    await this.executeHandlers(job);
  }

  async loadPersistedJobs(): Promise<void> {
    if (!this.store) return;
    const jobs = await this.store.load();
    for (const job of jobs) {
      this.addJob(job);
    }
  }

  start(): void {
    for (const task of this.tasks.values()) {
      task.start();
    }
  }

  stop(): void {
    for (const task of this.tasks.values()) {
      task.stop();
    }
  }

  private persist(): void {
    if (!this.store) return;
    const jobs = this.listJobs();
    this.persistChain = this.persistChain.then(() =>
      this.store!.save(jobs),
    );
  }

  private async executeHandlers(job: Job): Promise<void> {
    for (const handler of this.handlers) {
      await handler(job);
    }
  }
}
