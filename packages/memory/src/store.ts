import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import type { MemoryStore } from "@augure/types";

export class FileMemoryStore implements MemoryStore {
  constructor(private readonly basePath: string) {}

  async read(path: string): Promise<string> {
    return readFile(this.resolve(path), "utf-8");
  }

  async write(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
  }

  async append(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    try {
      const existing = await readFile(full, "utf-8");
      await writeFile(full, existing + content, "utf-8");
    } catch {
      await this.write(path, content);
    }
  }

  async list(directory?: string): Promise<string[]> {
    const dir = directory ? this.resolve(directory) : this.basePath;
    return this.listRecursive(dir);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }

  private resolve(path: string): string {
    return join(this.basePath, path);
  }

  private async listRecursive(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listRecursive(full)));
      } else {
        files.push(relative(this.basePath, full));
      }
    }
    return files;
  }
}
