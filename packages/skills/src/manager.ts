import { readFile, writeFile, mkdir, readdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import type {
  Skill,
  SkillMeta,
  SkillStatus,
  SkillIndex,
  SkillIndexEntry,
  SkillRunResult,
} from "@augure/types";
import { parseSkillMd, serializeSkillMd } from "./parser.js";

export class SkillManager {
  constructor(private readonly basePath: string) {}

  /** List all skills from the index (rebuilds if missing) */
  async list(): Promise<SkillIndexEntry[]> {
    try {
      const index = await this.readIndex();
      return index.skills;
    } catch {
      const index = await this.rebuildIndex();
      return index.skills;
    }
  }

  /** Load a single skill by ID */
  async get(id: string): Promise<Skill> {
    const dir = join(this.basePath, id);
    const mdContent = await readFile(join(dir, "skill.md"), "utf-8");
    const { meta, body } = parseSkillMd(mdContent);

    let code: string | undefined;
    try {
      code = await readFile(join(dir, "skill.ts"), "utf-8");
    } catch { /* no code yet */ }

    let testCode: string | undefined;
    try {
      testCode = await readFile(join(dir, "skill.test.ts"), "utf-8");
    } catch { /* no test yet */ }

    return { meta, body, code, testCode };
  }

  /** Save a skill to disk (creates directory, writes files, updates index) */
  async save(skill: Skill): Promise<void> {
    const dir = join(this.basePath, skill.meta.id);
    await mkdir(dir, { recursive: true });

    const mdContent = serializeSkillMd(skill.meta, skill.body);
    await writeFile(join(dir, "skill.md"), mdContent, "utf-8");

    if (skill.code !== undefined) {
      await writeFile(join(dir, "skill.ts"), skill.code, "utf-8");
    }
    if (skill.testCode !== undefined) {
      await writeFile(join(dir, "skill.test.ts"), skill.testCode, "utf-8");
    }

    await this.updateIndex(skill.meta);
  }

  /** Delete a skill directory and remove from index */
  async delete(id: string): Promise<void> {
    const dir = join(this.basePath, id);
    await rm(dir, { recursive: true, force: true });
    await this.removeFromIndex(id);
  }

  /** Update just the status of a skill */
  async updateStatus(id: string, status: SkillStatus): Promise<void> {
    const skill = await this.get(id);
    skill.meta.status = status;
    skill.meta.updated = new Date().toISOString();
    await this.save(skill);
  }

  /** Bump version number, returns the new version */
  async bumpVersion(id: string): Promise<number> {
    const skill = await this.get(id);
    skill.meta.version += 1;
    skill.meta.updated = new Date().toISOString();
    await this.save(skill);
    return skill.meta.version;
  }

  /** Save a run result to runs/<timestamp>.json */
  async saveRun(result: SkillRunResult): Promise<void> {
    const runsDir = join(this.basePath, result.skillId, "runs");
    await mkdir(runsDir, { recursive: true });
    const filename = `${result.timestamp.replace(/[:.]/g, "-")}.json`;
    await writeFile(join(runsDir, filename), JSON.stringify(result, null, 2), "utf-8");
  }

  /** Load recent run results for a skill, sorted newest first */
  async getRuns(id: string, limit = 10): Promise<SkillRunResult[]> {
    const runsDir = join(this.basePath, id, "runs");
    let files: string[];
    try {
      files = await readdir(runsDir);
    } catch {
      return [];
    }
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();
    const results: SkillRunResult[] = [];
    for (const file of jsonFiles.slice(0, limit)) {
      try {
        const raw = await readFile(join(runsDir, file), "utf-8");
        results.push(JSON.parse(raw));
      } catch { /* skip corrupted run files */ }
    }
    return results;
  }

  /** Get the most recent run result */
  async getLastRun(id: string): Promise<SkillRunResult | null> {
    const runs = await this.getRuns(id, 1);
    return runs[0] ?? null;
  }

  /** Rebuild skills-index.json by scanning all skill directories */
  async rebuildIndex(): Promise<SkillIndex> {
    await mkdir(this.basePath, { recursive: true });
    let entries: string[];
    try {
      entries = await readdir(this.basePath, { withFileTypes: true })
        .then((e) => e.filter((d) => d.isDirectory()).map((d) => d.name));
    } catch {
      entries = [];
    }

    const skills: SkillIndexEntry[] = [];
    for (const dir of entries) {
      try {
        const mdContent = await readFile(join(this.basePath, dir, "skill.md"), "utf-8");
        const { meta } = parseSkillMd(mdContent);
        skills.push(metaToIndexEntry(meta));
      } catch { /* skip invalid directories */ }
    }

    const index: SkillIndex = { version: 1, skills };
    await this.writeIndex(index);
    return index;
  }

  /** Check if a skill exists on disk */
  async exists(id: string): Promise<boolean> {
    try {
      await access(join(this.basePath, id, "skill.md"));
      return true;
    } catch {
      return false;
    }
  }

  private async readIndex(): Promise<SkillIndex> {
    const raw = await readFile(join(this.basePath, "skills-index.json"), "utf-8");
    return JSON.parse(raw);
  }

  private async writeIndex(index: SkillIndex): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(
      join(this.basePath, "skills-index.json"),
      JSON.stringify(index, null, 2),
      "utf-8",
    );
  }

  private async updateIndex(meta: SkillMeta): Promise<void> {
    let index: SkillIndex;
    try {
      index = await this.readIndex();
    } catch {
      index = { version: 1, skills: [] };
    }
    const entry = metaToIndexEntry(meta);
    const idx = index.skills.findIndex((s: SkillIndexEntry) => s.id === meta.id);
    if (idx >= 0) {
      index.skills[idx] = entry;
    } else {
      index.skills.push(entry);
    }
    await this.writeIndex(index);
  }

  private async removeFromIndex(id: string): Promise<void> {
    let index: SkillIndex;
    try {
      index = await this.readIndex();
    } catch {
      return;
    }
    index.skills = index.skills.filter((s: SkillIndexEntry) => s.id !== id);
    await this.writeIndex(index);
  }
}

function metaToIndexEntry(meta: SkillMeta): SkillIndexEntry {
  return {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    status: meta.status,
    trigger: meta.trigger,
    tags: meta.tags,
    updated: meta.updated,
  };
}
