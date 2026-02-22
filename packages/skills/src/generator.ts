import type {
  LLMClient,
  Skill,
  SkillGenerateRequest,
  SkillGenerateResult,
} from "@augure/types";
import { parseSkillResponse } from "./llm-parser.js";
import { parseSkillMd } from "./parser.js";

const GENERATION_SYSTEM_PROMPT = `You are a skill generator for the Augure AI agent. When given a description of a task, you generate three files that implement it.

## Output Format

You MUST output exactly three fenced code blocks with filenames:

\`\`\`yaml filename=skill.md
---
id: skill-id-here
name: Human Readable Name
version: 1
status: draft
trigger:
  type: TRIGGER_TYPE
  schedule: "CRON_EXPRESSION"  # only if trigger type is cron
  channel: CHANNEL              # optional
sandbox: true
tools: []
tags: []
---

# Skill Name

## Goal
What this skill does.

## Strategy
Step by step approach.
\`\`\`

\`\`\`typescript filename=skill.ts
import type { SkillContext } from "@augure/types";

export default async function execute(ctx: SkillContext): Promise<{ output: string }> {
  // Implementation here
  return { output: "result" };
}
\`\`\`

\`\`\`typescript filename=skill.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("skill-id", () => {
  it("should produce expected output", async () => {
    // Test the skill logic
    assert.ok(true);
  });
});
\`\`\`

## Rules
- The skill ID must be a lowercase slug (e.g., "daily-digest", "price-alert")
- Tests MUST use node:test and node:assert (NOT vitest or jest)
- The skill.ts default export must be an async function taking SkillContext
- Keep the implementation focused and minimal`;

const REGENERATION_SYSTEM_PROMPT = `You are a skill code fixer for the Augure AI agent. A skill failed to execute. You must fix the code.

## Rules
- Output exactly two fenced code blocks: skill.ts and skill.test.ts
- Keep the same function signature and approach
- Fix the specific error described
- Tests use node:test and node:assert (NOT vitest or jest)

Output format:
\`\`\`typescript filename=skill.ts
// fixed code
\`\`\`

\`\`\`typescript filename=skill.test.ts
// fixed test
\`\`\``;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export class SkillGenerator {
  constructor(private readonly llm: LLMClient) {}

  async generate(request: SkillGenerateRequest): Promise<SkillGenerateResult> {
    const id = slugify(request.description);
    if (!id) {
      return { success: false, error: "Could not generate a valid skill ID from description" };
    }

    const userPrompt = [
      `Create a skill with the following specification:`,
      `- ID: ${id}`,
      `- Description: ${request.description}`,
      `- Trigger type: ${request.trigger.type}`,
      request.trigger.schedule ? `- Schedule: ${request.trigger.schedule}` : null,
      request.trigger.channel ? `- Channel: ${request.trigger.channel}` : null,
      request.tags?.length ? `- Tags: ${request.tags.join(", ")}` : null,
      `- Sandbox: ${request.sandbox !== false}`,
    ].filter(Boolean).join("\n");

    try {
      const response = await this.llm.chat([
        { role: "system", content: GENERATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ]);

      const parsed = parseSkillResponse(response.content);
      if (!parsed) {
        return { success: false, error: "Failed to parse LLM response: missing code blocks" };
      }

      const { meta, body } = parseSkillMd(parsed.skillMd);
      // Override ID with our slugified version for consistency
      meta.id = id;
      const skill: Skill = {
        meta,
        body,
        code: parsed.skillTs,
        testCode: parsed.skillTestTs,
      };

      return { success: true, skill };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async regenerateCode(
    skill: Skill,
    error: string,
  ): Promise<{ code: string; testCode: string } | null> {
    const userPrompt = [
      `## Skill: ${skill.meta.name} (${skill.meta.id})`,
      ``,
      `## Description`,
      skill.body,
      ``,
      `## Current code (skill.ts)`,
      "```typescript",
      skill.code ?? "// no code yet",
      "```",
      ``,
      `## Error`,
      "```",
      error,
      "```",
      ``,
      `Fix the code to resolve this error.`,
    ].join("\n");

    try {
      const response = await this.llm.chat([
        { role: "system", content: REGENERATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ]);

      // Parse just two code blocks
      const blockPattern = /```\w*(?:\s+\S+)?\s*\n([\s\S]*?)```/g;
      const blocks: string[] = [];
      let match;
      while ((match = blockPattern.exec(response.content)) !== null) {
        blocks.push(match[1].trim());
      }

      if (blocks.length < 2) return null;
      return { code: blocks[0], testCode: blocks[1] };
    } catch {
      return null;
    }
  }
}
