import type { Skill } from "@augure/types";
import { parseSkillMd } from "./parser.js";

export interface HubConfig {
  repo: string;
  branch: string;
}

export interface HubEntry {
  id: string;
  name: string;
  description: string;
}

export class SkillHub {
  private readonly baseUrl: string;

  constructor(private readonly config: HubConfig) {
    this.baseUrl = `https://raw.githubusercontent.com/${config.repo}/${config.branch}`;
  }

  /** List available skills from the hub manifest */
  async list(): Promise<HubEntry[]> {
    const url = `${this.baseUrl}/manifest.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch hub manifest: ${response.status} ${response.statusText}`);
    }
    const manifest = (await response.json()) as { version: number; skills: HubEntry[] };
    return manifest.skills;
  }

  /** Download a complete skill from the hub */
  async download(skillId: string): Promise<Skill> {
    const skillMd = await this.fetchFile(`skills/${skillId}/skill.md`);
    const { meta, body } = parseSkillMd(skillMd);

    let code: string | undefined;
    try {
      code = await this.fetchFile(`skills/${skillId}/skill.ts`);
    } catch { /* optional */ }

    let testCode: string | undefined;
    try {
      testCode = await this.fetchFile(`skills/${skillId}/skill.test.ts`);
    } catch { /* optional */ }

    // Force sandbox for hub-downloaded skills (security)
    meta.sandbox = true;
    return { meta, body, code, testCode };
  }

  private async fetchFile(path: string): Promise<string> {
    const url = `${this.baseUrl}/${path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
}
