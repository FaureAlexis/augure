import { createTask, validate, type ScheduledTask } from "node-cron";
import type { Job, Scheduler } from "@augure/types";
import type { JobStore } from "./jobs.js";

type JobTriggerHandler = (job: Job) => void | Promise<void>;

export class CronScheduler implements Scheduler {
  private jobs = new Map<string, Job>();
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private handlers: JobTriggerHandler[] = [];
  private persistChain: Promise<void> = Promise.resolve();

  constructor(private readonly store?: JobStore) {}

  onJobTrigger(handler: JobTriggerHandler): void {
    this.handlers.push(handler);
  }

  addJob(job: Job): void {
    if (!job.cron && !job.runAt) {
      throw new Error(`Job ${job.id} must have either cron or runAt`);
    }
    if (job.cron && !validate(job.cron)) {
      throw new Error(`Invalid cron expression: ${job.cron}`);
    }
    if (job.runAt && isNaN(Date.parse(job.runAt))) {
      throw new Error(`Invalid runAt date: ${job.runAt}`);
    }

    this.jobs.set(job.id, job);

    if (job.enabled && job.cron) {
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
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
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
      // Skip one-shot jobs whose date has already passed
      if (job.runAt && Date.parse(job.runAt) <= Date.now()) {
        continue;
      }
      this.addJob(job);
    }
  }

  start(): void {
    for (const task of this.tasks.values()) {
      task.start();
    }
    // Schedule one-shot jobs
    for (const job of this.jobs.values()) {
      if (job.enabled && job.runAt && !job.cron) {
        this.scheduleOneShot(job);
      }
    }
  }

  stop(): void {
    for (const task of this.tasks.values()) {
      task.stop();
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private scheduleOneShot(job: Job): void {
    const delayMs = Date.parse(job.runAt!) - Date.now();
    if (delayMs <= 0) return;

    const timer = setTimeout(() => {
      this.timers.delete(job.id);
      void this.executeHandlers(job).then(() => {
        this.removeJob(job.id);
      });
    }, delayMs);

    this.timers.set(job.id, timer);
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
