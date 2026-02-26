import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

export interface PersonaFrontmatter {
  id: string;
  name: string;
  triggers?: {
    keywords?: string[];
    skills?: string[];
  };
  priority?: number;
}

export interface LoadedPersona {
  meta: PersonaFrontmatter;
  body: string;
}

export class PersonaResolver {
  private readonly personaDir: string;
  private personas: LoadedPersona[] = [];

  constructor(personaDir: string) {
    this.personaDir = personaDir;
  }

  async loadAll(): Promise<void> {
    this.personas = [];
    let entries: string[];
    try {
      entries = await readdir(this.personaDir);
    } catch {
      return; // Directory doesn't exist, no personas
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const content = await readFile(join(this.personaDir, entry), "utf-8");
      const { data, content: body } = matter(content);
      const meta: PersonaFrontmatter = {
        id: data.id ?? entry.replace(".md", ""),
        name: data.name ?? entry.replace(".md", ""),
        triggers: data.triggers,
        priority: data.priority ?? 0,
      };
      this.personas.push({ meta, body: body.trim() });
    }

    // Sort by id for deterministic tie resolution
    this.personas.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  }

  listAll(): LoadedPersona[] {
    return [...this.personas];
  }

  resolve(message: string, activeSkillId?: string): string {
    const defaultPersona = this.personas.find((p) => p.meta.id === "default");
    const baseParts: string[] = [];
    if (defaultPersona) {
      baseParts.push(defaultPersona.body);
    }

    // Score each non-default persona
    let bestMatch: LoadedPersona | undefined;
    let bestScore = 0;

    const lowerMessage = message.toLowerCase();

    for (const persona of this.personas) {
      if (persona.meta.id === "default") continue;
      let score = 0;

      // Keyword matching
      if (persona.meta.triggers?.keywords) {
        for (const kw of persona.meta.triggers.keywords) {
          if (lowerMessage.includes(kw.toLowerCase())) {
            score++;
          }
        }
      }

      // Skill pattern matching
      if (activeSkillId && persona.meta.triggers?.skills) {
        for (const pattern of persona.meta.triggers.skills) {
          if (matchGlob(pattern, activeSkillId)) {
            score += 2; // Skill match weights more
          }
        }
      }

      // Only consider personas with at least one keyword/skill match
      if (score === 0) continue;

      // Add priority as a tiebreaker (higher priority wins)
      const priority = persona.meta.priority ?? 0;
      const finalScore = score + priority;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMatch = persona;
      }
    }

    if (bestMatch) {
      baseParts.push(bestMatch.body);
    }

    return baseParts.join("\n\n");
  }
}

function matchGlob(pattern: string, value: string): boolean {
  // Simple glob: only supports trailing * (e.g., "github-*")
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}
