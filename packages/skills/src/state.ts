import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SkillState } from "@augure/types";

export class FileSkillState implements SkillState {
  private data: Record<string, string> = {};
  private loaded = false;

  constructor(private readonly filePath: string) {}

  async get(key: string): Promise<string | undefined> {
    await this.ensureLoaded();
    return this.data[key];
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureLoaded();
    this.data[key] = value;
    await this.persist();
  }

  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    delete this.data[key];
    await this.persist();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
}
