import { describe, it, expect, vi } from "vitest";
import { Agent } from "../agent.js";
import type { LLMClient, LLMResponse, Message, MemoryStore } from "@augure/types";
import { ToolRegistry } from "@augure/tools";
import { MemoryIngester, MemoryRetriever } from "@augure/memory";

function createMockLLM(response: Partial<LLMResponse> = {}): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response.content ?? "Mock response",
      toolCalls: response.toolCalls ?? [],
      usage: response.usage ?? { inputTokens: 10, outputTokens: 5 },
    }),
  };
}

describe("Agent", () => {
  it("should process a message and return LLM response", async () => {
    const llm = createMockLLM({ content: "Bonjour!" });
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    const response = await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Salut",
      timestamp: new Date(),
    });

    expect(response).toBe("Bonjour!");
    expect(llm.chat).toHaveBeenCalledOnce();
  });

  it("should include memory in context", async () => {
    const llm = createMockLLM();
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "User prefers French.",
    });

    await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Hello",
      timestamp: new Date(),
    });

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Message[];
    const systemMsg = callArgs.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("User prefers French.");
  });

  it("should handle tool calls and loop", async () => {
    const llm: LLMClient = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            { id: "tc1", name: "test_tool", arguments: { input: "hello" } },
          ],
          usage: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          content: "Done with tool result!",
          toolCalls: [],
          usage: { inputTokens: 20, outputTokens: 10 },
        }),
    };

    const tools = new ToolRegistry();
    tools.register({
      name: "test_tool",
      description: "test",
      parameters: {},
      execute: async () => ({
        success: true,
        output: "tool output",
      }),
    });

    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    const response = await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Use the tool",
      timestamp: new Date(),
    });

    expect(response).toBe("Done with tool result!");
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  it("should maintain conversation history across messages", async () => {
    const llm = createMockLLM({ content: "Reply" });
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "First message",
      timestamp: new Date(),
    });

    await agent.handleMessage({
      id: "2",
      channelType: "telegram",
      userId: "123",
      text: "Second message",
      timestamp: new Date(),
    });

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock
      .calls[1][0] as Message[];
    const userMessages = callArgs.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(2);
  });

  it("should use MemoryRetriever for dynamic context when provided", async () => {
    const llm = createMockLLM({ content: "OK" });
    const tools = new ToolRegistry();

    const mockStore = {
      read: vi.fn().mockResolvedValue("dynamic memory content"),
      write: vi.fn(),
      append: vi.fn(),
      list: vi.fn().mockResolvedValue(["observations.md"]),
      exists: vi.fn().mockResolvedValue(true),
    } as unknown as MemoryStore;

    const retriever = new MemoryRetriever(mockStore);
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
      retriever,
    });

    await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Hello",
      timestamp: new Date(),
    });

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Message[];
    const systemMsg = callArgs.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("dynamic memory content");
  });

  it("should isolate conversation history per userId", async () => {
    const llm = createMockLLM({ content: "Reply" });
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    await agent.handleMessage({
      id: "1", channelType: "telegram", userId: "user-A",
      text: "Hello from A", timestamp: new Date(),
    });

    await agent.handleMessage({
      id: "2", channelType: "telegram", userId: "user-B",
      text: "Hello from B", timestamp: new Date(),
    });

    await agent.handleMessage({
      id: "3", channelType: "telegram", userId: "user-A",
      text: "Second from A", timestamp: new Date(),
    });

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock
      .calls[2][0] as Message[];
    const userMessages = callArgs.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(2);
    expect(userMessages[0]!.content).toBe("Hello from A");
    expect(userMessages[1]!.content).toBe("Second from A");
  });

  it("should clear history for a specific user", async () => {
    const llm = createMockLLM({ content: "Reply" });
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    await agent.handleMessage({
      id: "1", channelType: "telegram", userId: "user-A",
      text: "Message 1", timestamp: new Date(),
    });

    agent.clearHistory("user-A");

    await agent.handleMessage({
      id: "2", channelType: "telegram", userId: "user-A",
      text: "Message 2", timestamp: new Date(),
    });

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock
      .calls[1][0] as Message[];
    const userMessages = callArgs.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]!.content).toBe("Message 2");
  });

  it("should log a summary with tokens and timing after handling a message", async () => {
    const llm: LLMClient = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            { id: "tc1", name: "test_tool", arguments: {} },
          ],
          usage: { inputTokens: 100, outputTokens: 20 },
        })
        .mockResolvedValueOnce({
          content: "Done",
          toolCalls: [],
          usage: { inputTokens: 150, outputTokens: 30 },
        }),
    };

    const tools = new ToolRegistry();
    tools.register({
      name: "test_tool",
      description: "test",
      parameters: {},
      execute: async () => ({ success: true, output: "ok" }),
    });

    const logs: string[] = [];
    const logger = {
      debug: vi.fn(),
      info: vi.fn((...args: unknown[]) => logs.push(String(args[0]))),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "test",
      memoryContent: "",
      logger,
    });

    await agent.handleMessage({
      id: "1", channelType: "telegram", userId: "123",
      text: "go", timestamp: new Date(),
    });

    const summary = logs.find((l) => l.startsWith("──"));
    expect(summary).toBeDefined();
    expect(summary).toContain("250+50 tokens");
    expect(summary).toContain("2 LLM calls");
    expect(summary).toContain("1 tool calls");
    expect(summary).toMatch(/\d+ms/);
  });

  it("should trigger ingestion after message when ingester is provided", async () => {
    const llm = createMockLLM({ content: "Response" });
    const tools = new ToolRegistry();

    const mockStore = {
      read: vi.fn().mockRejectedValue(new Error("not found")),
      write: vi.fn(),
      append: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(false),
    } as unknown as MemoryStore;

    const ingestLLM = createMockLLM({ content: "- User said hello" });
    const ingester = new MemoryIngester(ingestLLM, mockStore);
    const ingestSpy = vi.spyOn(ingester, "ingest");

    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
      ingester,
    });

    await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Hello",
      timestamp: new Date(),
    });

    // Wait a tick for the background ingestion promise
    await new Promise((r) => setTimeout(r, 10));

    expect(ingestSpy).toHaveBeenCalledOnce();
  });
});
