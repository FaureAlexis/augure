import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryIngester } from "../ingest.js";
import { FileMemoryStore } from "../store.js";
import type { LLMClient, Message } from "@augure/types";

function mockLLM(extractedFacts: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: extractedFacts,
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  };
}

describe("MemoryIngester", () => {
  let dir: string;
  let store: FileMemoryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ingest-test-"));
    store = new FileMemoryStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should extract observations and append to observations.md", async () => {
    const llm = mockLLM("- User prefers TypeScript\n- Working on project Augure");
    const ingester = new MemoryIngester(llm, store);

    const conversation: Message[] = [
      { role: "user", content: "I'm building Augure in TypeScript" },
      { role: "assistant", content: "Great choice! TypeScript is excellent for this." },
    ];

    await ingester.ingest(conversation);

    const content = await store.read("observations.md");
    expect(content).toContain("User prefers TypeScript");
    expect(content).toContain("Working on project Augure");
  });

  it("should prepend a date header", async () => {
    const llm = mockLLM("- Some fact");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);

    const content = await store.read("observations.md");
    expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}/);
  });

  it("should append to existing observations without overwriting", async () => {
    await store.write("observations.md", "## 2026-02-20\n- Old observation\n\n");

    const llm = mockLLM("- New observation");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Something new" },
      { role: "assistant", content: "Got it" },
    ]);

    const content = await store.read("observations.md");
    expect(content).toContain("Old observation");
    expect(content).toContain("New observation");
  });

  it("should skip ingestion if conversation is empty", async () => {
    const llm = mockLLM("nothing");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([]);

    expect(await store.exists("observations.md")).toBe(false);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it("should skip ingestion if LLM returns no observations", async () => {
    const llm = mockLLM("No notable observations.");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);

    expect(await store.exists("observations.md")).toBe(false);
  });

  it("should pass the conversation to the LLM with extraction prompt", async () => {
    const llm = mockLLM("- Fact one");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Test message" },
      { role: "assistant", content: "Test reply" },
    ]);

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message[];
    const systemMsg = callArgs.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain("extract");
  });
});
