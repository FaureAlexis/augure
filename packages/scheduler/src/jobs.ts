import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Job } from "@augure/types";

export class JobStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Job[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as Job[];
    } catch {
      return [];
    }
  }

  async save(jobs: Job[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(jobs, null, 2), "utf-8");
  }
}
