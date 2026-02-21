import type { MemoryStore } from "@augure/types";

export interface RetrieverOptions {
  maxTokens?: number;
}

// Priority files loaded first (order matters)
const PRIORITY_FILES = ["identity.md", "observations.md"];

// Approximate token count: ~4 chars per token
const CHARS_PER_TOKEN = 4;

export class MemoryRetriever {
  private readonly maxChars: number;

  constructor(
    private readonly store: MemoryStore,
    options: RetrieverOptions = {},
  ) {
    const maxTokens = options.maxTokens ?? 10_000;
    this.maxChars = maxTokens * CHARS_PER_TOKEN;
  }

  async retrieve(): Promise<string> {
    const allFiles = await this.safeList();
    if (allFiles.length === 0) return "";

    // Priority files first, then the rest alphabetically
    const prioritySet = new Set(PRIORITY_FILES);
    const orderedFiles = [
      ...PRIORITY_FILES.filter((f) => allFiles.includes(f)),
      ...allFiles.filter((f) => !prioritySet.has(f)).sort(),
    ];

    const sections: string[] = [];
    let totalChars = 0;

    for (const file of orderedFiles) {
      if (totalChars >= this.maxChars) break;

      try {
        const content = await this.store.read(file);
        const header = `### ${file}`;
        const section = `${header}\n${content}`;
        const sectionChars = section.length;

        if (totalChars + sectionChars > this.maxChars) {
          const remaining = this.maxChars - totalChars;
          if (remaining > header.length + 50) {
            sections.push(section.slice(0, remaining) + "\n[...truncated]");
            totalChars = this.maxChars;
          }
          break;
        }

        sections.push(section);
        totalChars += sectionChars;
      } catch {
        // Skip files that can't be read
      }
    }

    return sections.join("\n\n");
  }

  private async safeList(): Promise<string[]> {
    try {
      return await this.store.list();
    } catch {
      return [];
    }
  }
}
