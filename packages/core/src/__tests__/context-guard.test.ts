import { describe, it, expect } from "vitest";
import type { Message } from "@augure/types";
import { ContextGuard } from "../context-guard.js";

describe("ContextGuard", () => {
  describe("compact()", () => {
    it("does not modify messages under budget", () => {
      const guard = new ContextGuard({ maxContextTokens: 200_000 });
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
        { role: "assistant", content: "I am fine" },
        { role: "user", content: "Great" },
      ];

      const result = guard.compact(messages);

      expect(result).toEqual(messages);
    });

    it("truncates old tool results beyond recent window", () => {
      const guard = new ContextGuard();
      const messages: Message[] = [];

      // 5 old tool messages (indices 0-4, all before cutoff)
      for (let i = 0; i < 5; i++) {
        messages.push({ role: "tool", content: `Tool result ${i}`, toolCallId: `call_${i}` });
      }

      // 10 recent non-tool messages (indices 5-14)
      for (let i = 0; i < 10; i++) {
        messages.push({ role: "user", content: `Message ${i}` });
      }

      const result = guard.compact(messages);

      // Old tool results (indices 0-4) should be truncated
      for (let i = 0; i < 5; i++) {
        expect(result[i].content).toBe("[Tool result truncated]");
      }

      // Recent messages should be preserved
      for (let i = 5; i < 15; i++) {
        expect(result[i].content).toBe(`Message ${i - 5}`);
      }
    });

    it("truncates long tool results", () => {
      const guard = new ContextGuard();
      const longContent = "x".repeat(3000);
      const messages: Message[] = [
        { role: "user", content: "run tool" },
        { role: "tool", content: longContent, toolCallId: "call_1" },
      ];

      const result = guard.compact(messages);

      expect(result[1].content.length).toBeLessThan(longContent.length);
      expect(result[1].content).toBe("x".repeat(2000) + "... [truncated]");
    });

    it("limits conversation turns", () => {
      const guard = new ContextGuard({ maxConversationTurns: 5 });
      const messages: Message[] = [];

      for (let i = 0; i < 10; i++) {
        messages.push({ role: "user", content: `Message ${i}` });
      }

      const result = guard.compact(messages);

      expect(result).toHaveLength(5);
      expect(result[0].content).toBe("Message 5");
      expect(result[4].content).toBe("Message 9");
    });

    it("drops oldest messages when over token budget", () => {
      const guard = new ContextGuard({
        maxContextTokens: 200,
        reservedForOutput: 50,
      });

      // Budget = 200 - 50 = 150 tokens = 600 chars
      const messages: Message[] = [
        { role: "user", content: "a".repeat(400) },   // 100 tokens
        { role: "assistant", content: "b".repeat(400) }, // 100 tokens
        { role: "user", content: "c".repeat(400) },   // 100 tokens
      ];

      const result = guard.compact(messages);

      // Total would be 300 tokens, budget is 150
      // Should drop oldest until under budget
      expect(result.length).toBeLessThan(messages.length);
      // Last message should always be preserved
      expect(result[result.length - 1].content).toBe("c".repeat(400));
    });
  });

  describe("estimateTokens()", () => {
    it("returns chars/4 rounded up", () => {
      const guard = new ContextGuard();

      // "hello" = 5 chars -> ceil(5/4) = 2
      expect(guard.estimateTokens("hello")).toBe(2);

      // 400 chars -> ceil(400/4) = 100
      expect(guard.estimateTokens("a".repeat(400))).toBe(100);
    });
  });
});
