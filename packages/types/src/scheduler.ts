export interface Job {
  id: string;
  cron: string;
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
