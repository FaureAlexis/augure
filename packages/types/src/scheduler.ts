export interface Job {
  id: string;
  /** Cron expression for recurring jobs. Omit if using runAt. */
  cron?: string;
  /** ISO 8601 date string for one-shot jobs. Omit if using cron. */
  runAt?: string;
  prompt: string;
  channel: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  addJob(job: Job): void;
  removeJob(id: string): void;
  listJobs(): Job[];
  triggerJob(id: string): Promise<void>;
}
