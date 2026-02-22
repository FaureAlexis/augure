import { describe, it, expect, vi } from "vitest";
import { SkillGenerator, slugify } from "../generator.js";
import type { LLMClient, LLMResponse } from "@augure/types";

function mockLLM(content: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content,
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 200 },
    } satisfies LLMResponse),
  };
}

const VALID_LLM_OUTPUT = `Here is the skill:

\`\`\`yaml filename=skill.md
---
id: daily-report
name: Daily Report
version: 1
status: draft
trigger:
  type: cron
  schedule: "0 8 * * *"
  channel: telegram
sandbox: true
tools: []
tags:
  - reporting
---

# Daily Report

## Goal
Generate a daily report.

## Strategy
1. Read memory
2. Summarize
\`\`\`

\`\`\`typescript filename=skill.ts
import type { SkillContext } from "@augure/types";

export default async function execute(ctx: SkillContext): Promise<{ output: string }> {
  return { output: "Daily report generated" };
}
\`\`\`

\`\`\`typescript filename=skill.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("daily-report", () => {
  it("should generate output", async () => {
    assert.ok(true);
  });
});
\`\`\`
`;

describe("slugify", () => {
  it("should convert description to slug", () => {
    expect(slugify("Daily stock report")).toBe("daily-stock-report");
  });

  it("should remove special characters", () => {
    expect(slugify("Check prices (€/USD)")).toBe("check-prices-usd");
  });

  it("should trim to 50 chars", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });

  it("should handle empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("SkillGenerator", () => {
  it("should generate a skill from valid LLM output", async () => {
    const llm = mockLLM(VALID_LLM_OUTPUT);
    const gen = new SkillGenerator(llm);

    const result = await gen.generate({
      description: "daily report",
      trigger: { type: "cron", schedule: "0 8 * * *", channel: "telegram" },
      tags: ["reporting"],
    });

    expect(result.success).toBe(true);
    expect(result.skill).toBeDefined();
    expect(result.skill!.meta.id).toBe("daily-report");
    expect(result.skill!.meta.trigger.type).toBe("cron");
    expect(result.skill!.code).toContain("export default");
    expect(result.skill!.testCode).toContain("node:test");
  });

  it("should return error for malformed LLM output", async () => {
    const llm = mockLLM("This is just text with no code blocks.");
    const gen = new SkillGenerator(llm);

    const result = await gen.generate({
      description: "test",
      trigger: { type: "manual" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing code blocks");
  });

  it("should return error when LLM throws", async () => {
    const llm: LLMClient = {
      chat: vi.fn().mockRejectedValue(new Error("API rate limited")),
    };
    const gen = new SkillGenerator(llm);

    const result = await gen.generate({
      description: "test",
      trigger: { type: "manual" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API rate limited");
  });

  it("should return error for empty description slug", async () => {
    const llm = mockLLM(VALID_LLM_OUTPUT);
    const gen = new SkillGenerator(llm);

    const result = await gen.generate({
      description: "!!!",
      trigger: { type: "manual" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("valid skill ID");
  });

  it("should include trigger info in LLM prompt", async () => {
    const llm = mockLLM(VALID_LLM_OUTPUT);
    const gen = new SkillGenerator(llm);

    await gen.generate({
      description: "daily report",
      trigger: { type: "cron", schedule: "0 9 * * *", channel: "telegram" },
      tags: ["test"],
    });

    const call = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMsg = call[1].content as string;
    expect(userMsg).toContain("cron");
    expect(userMsg).toContain("0 9 * * *");
    expect(userMsg).toContain("telegram");
    expect(userMsg).toContain("test");
  });
});

describe("SkillGenerator.regenerateCode", () => {
  it("should return fixed code from LLM", async () => {
    const fixedOutput = `Here is the fix:

\`\`\`typescript filename=skill.ts
export default async function execute(ctx) {
  return { output: "fixed" };
}
\`\`\`

\`\`\`typescript filename=skill.test.ts
import { describe, it } from "node:test";
describe("test", () => { it("works", () => {}); });
\`\`\``;

    const llm = mockLLM(fixedOutput);
    const gen = new SkillGenerator(llm);

    const result = await gen.regenerateCode(
      {
        meta: { id: "test", name: "Test", version: 1, created: "", updated: "", status: "broken", trigger: { type: "manual" }, sandbox: true, tools: [], tags: [] },
        body: "Test skill",
        code: "broken code",
      },
      "TypeError: Cannot read property 'x'",
    );

    expect(result).not.toBeNull();
    expect(result!.code).toContain("fixed");
    expect(result!.testCode).toContain("node:test");
  });

  it("should return null when LLM output has fewer than 2 blocks", async () => {
    const llm = mockLLM("Sorry, I cannot fix this.");
    const gen = new SkillGenerator(llm);

    const result = await gen.regenerateCode(
      {
        meta: { id: "test", name: "Test", version: 1, created: "", updated: "", status: "broken", trigger: { type: "manual" }, sandbox: true, tools: [], tags: [] },
        body: "Test",
      },
      "some error",
    );

    expect(result).toBeNull();
  });

  it("should return null when LLM throws", async () => {
    const llm: LLMClient = {
      chat: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const gen = new SkillGenerator(llm);

    const result = await gen.regenerateCode(
      {
        meta: { id: "test", name: "Test", version: 1, created: "", updated: "", status: "broken", trigger: { type: "manual" }, sandbox: true, tools: [], tags: [] },
        body: "Test",
      },
      "error",
    );

    expect(result).toBeNull();
  });
});
