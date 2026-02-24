import { createTask, validate, type ScheduledTask } from "node-cron";
import type { Job, Logger, Scheduler } from "@augure/types";
import { noopLogger } from "@augure/types";
import type { JobStore } from "./jobs.js";

type JobTriggerHandler = (job: Job) => void | Promise<void>;

export interface CronSchedulerOptions {
  store?: JobStore;
  logger?: Logger;
}

export class CronScheduler implements Scheduler {
  private jobs = new Map<string, Job>();
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private handlers: JobTriggerHandler[] = [];
  private persistChain: Promise<void> = Promise.resolve();
  private running = false;
  private readonly store?: JobStore;
  private readonly log: Logger;

  constructor(storeOrOpts?: JobStore | CronSchedulerOptions) {
    if (storeOrOpts && "save" in storeOrOpts) {
      // Legacy: direct JobStore argument
      this.store = storeOrOpts as JobStore;
      this.log = noopLogger;
    } else if (storeOrOpts) {
      const opts = storeOrOpts as CronSchedulerOptions;
      this.store = opts.store;
      this.log = opts.logger ?? noopLogger;
    } else {
      this.log = noopLogger;
    }
  }

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
    this.log.info(`Added job ${job.id} (${job.cron ? `cron: ${job.cron}` : `runAt: ${job.runAt}`})`);

    if (job.enabled && job.cron) {
      const task = createTask(job.cron, () => {
        this.log.info(`Cron fired for job ${job.id}`);
        this.executeHandlers(job).catch((err) =>
          this.log.error(`Cron job ${job.id} handler failed:`, err),
        );
      });
      if (this.running) {
        task.start();
        this.log.debug(`Started cron task for ${job.id} immediately (scheduler already running)`);
      }
      this.tasks.set(job.id, task);
    }

    if (job.enabled && job.runAt && !job.cron) {
      if (this.running) {
        this.scheduleOneShot(job);
      } else {
        this.log.warn(`Scheduler not running — one-shot job ${job.id} will be scheduled on start()`);
      }
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
    this.log.debug(`Removed job ${id}`);
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
    this.log.info(`Loading ${jobs.length} persisted jobs`);
    for (const job of jobs) {
      // Skip one-shot jobs whose date has already passed
      if (job.runAt && Date.parse(job.runAt) <= Date.now()) {
        this.log.debug(`Skipping expired one-shot job ${job.id} (runAt: ${job.runAt})`);
        continue;
      }
      this.addJob(job);
    }
  }

  start(): void {
    this.running = true;
    this.log.info(`Starting with ${this.tasks.size} cron tasks and ${this.handlers.length} handlers`);
    for (const [id, task] of this.tasks) {
      task.start();
      this.log.debug(`Started cron task: ${id}`);
    }
    // Schedule one-shot jobs
    for (const job of this.jobs.values()) {
      if (job.enabled && job.runAt && !job.cron) {
        this.scheduleOneShot(job);
      }
    }
  }

  stop(): void {
    this.log.info("Scheduler stopped");
    this.running = false;
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
    if (delayMs <= 0) {
      this.log.warn(`One-shot job ${job.id} already expired (delay: ${delayMs}ms), skipping`);
      return;
    }

    this.log.info(`Scheduled one-shot job ${job.id} in ${Math.round(delayMs / 1000)}s (${job.runAt})`);

    const timer = setTimeout(() => {
      this.log.info(`One-shot job ${job.id} firing now`);
      this.timers.delete(job.id);
      this.executeHandlers(job)
        .then(() => this.removeJob(job.id))
        .catch((err) => this.log.error(`One-shot job ${job.id} handler failed:`, err));
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
    this.log.debug(`Executing ${this.handlers.length} handlers for job ${job.id}`);
    for (const handler of this.handlers) {
      await handler(job);
    }
  }
}
