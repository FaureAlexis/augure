import { describe, it, expect, vi } from "vitest";
import { Agent } from "../agent.js";
import type { LLMClient, LLMResponse, Message } from "@augure/types";
import { ToolRegistry } from "@augure/tools";

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
});
