import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Heartbeat } from "../heartbeat.js";
import type { LLMClient, MemoryStore, Message } from "@augure/types";

function mockLLM(response: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response,
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 20 },
    }),
  };
}

function mockMemory(files: Record<string, string> = {}): MemoryStore {
  return {
    read: vi.fn(async (path: string) => {
      if (files[path]) return files[path];
      throw new Error("not found");
    }),
    write: vi.fn(),
    append: vi.fn(),
    list: vi.fn().mockResolvedValue(Object.keys(files)),
    exists: vi.fn(async (path: string) => path in files),
  } as unknown as MemoryStore;
}

describe("Heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call the monitor LLM on tick", async () => {
    const llm = mockLLM("ACTION: none");
    const memory = mockMemory({ "observations.md": "- User likes coffee\n" });
    const handler = vi.fn();

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: handler,
    });

    await heartbeat.tick();

    expect(llm.chat).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("should trigger onAction when monitor says ACTION: needed", async () => {
    const llm = mockLLM(
      "ACTION: Check apartment listings on SeLoger for Bordeaux < 1100\u20AC",
    );
    const memory = mockMemory({
      "observations.md": "- User looking for apartments\n",
    });
    const handler = vi.fn();

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: handler,
    });

    await heartbeat.tick();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      "Check apartment listings on SeLoger for Bordeaux < 1100\u20AC",
    );
  });

  it("should include memory context in LLM call", async () => {
    const llm = mockLLM("ACTION: none");
    const memory = mockMemory({ "observations.md": "- Important fact\n" });

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: vi.fn(),
    });

    await heartbeat.tick();

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Message[];
    const userMsg = callArgs.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("Important fact");
  });

  it("should start and stop interval", () => {
    const llm = mockLLM("ACTION: none");
    const memory = mockMemory();

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: vi.fn(),
    });

    heartbeat.start();
    heartbeat.stop();
  });
});
