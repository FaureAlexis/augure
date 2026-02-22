import { describe, it, expect } from "vitest";
import { assembleContext } from "../context.js";
import type { Message } from "@augure/types";

describe("assembleContext", () => {
  it("should assemble system prompt + memory + conversation", () => {
    const history: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const messages = assembleContext({
      systemPrompt: "You are Augure.",
      memoryContent: "User prefers French.",
      conversationHistory: history,
    });

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("You are Augure.");
    expect(messages[0].content).toContain("User prefers French.");
    expect(messages).toHaveLength(3);
  });

  it("should include persona overlay", () => {
    const messages = assembleContext({
      systemPrompt: "You are Augure.",
      memoryContent: "",
      conversationHistory: [],
      persona: "You are a senior engineer.",
    });

    expect(messages[0].content).toContain("Active Persona");
    expect(messages[0].content).toContain("senior engineer");
  });

  it("should keep system prompt when conversation history is empty", () => {
    const messages = assembleContext({
      systemPrompt: "You are Augure.",
      memoryContent: "",
      conversationHistory: [],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
  });

  it("should inject current date and time into system prompt", () => {
    const messages = assembleContext({
      systemPrompt: "You are Augure.",
      memoryContent: "",
      conversationHistory: [],
    });

    expect(messages[0].content).toContain("Current date and time:");
  });
});
