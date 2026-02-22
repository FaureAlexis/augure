import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "@augure/types";
import { noopLogger } from "@augure/types";

export interface AuditEntry {
  ts: string;
  trigger: "user" | "cron" | "heartbeat" | "skill";
  action: string;
  skillId?: string;
  trust?: "sandboxed" | "trusted";
  inputSummary: string;
  outputSummary: string;
  tokens?: { input: number; output: number; model: string };
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface AuditLogger {
  log(entry: AuditEntry): void;
  close(): Promise<void>;
}

export function summarize(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export class FileAuditLogger implements AuditLogger {
  private readonly basePath: string;
  private readonly logger: Logger;
  private pendingWrite: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(basePath: string, logger?: Logger) {
    this.basePath = basePath;
    this.logger = logger ?? noopLogger;
  }

  log(entry: AuditEntry): void {
    this.pendingWrite = this.pendingWrite
      .then(() => this.writeEntry(entry))
      .catch((err) => this.logger.error("Audit write error:", err));
  }

  async close(): Promise<void> {
    await this.pendingWrite;
  }

  private async writeEntry(entry: AuditEntry): Promise<void> {
    const dir = join(this.basePath, "actions");
    if (!this.initialized) {
      await mkdir(dir, { recursive: true });
      this.initialized = true;
    }
    const date = entry.ts.slice(0, 10);
    const filePath = join(dir, `${date}.jsonl`);
    await appendFile(filePath, JSON.stringify(entry) + "\n");
  }
}

export class NullAuditLogger implements AuditLogger {
  log(_entry: AuditEntry): void {
    // No-op
  }
  async close(): Promise<void> {
    // No-op
  }
}
