import type { Message } from "@augure/types";

export interface ContextGuardConfig {
  maxContextTokens: number;       // default: 200_000
  reservedForOutput: number;      // default: 8_192
  maxConversationTurns: number;   // default: 50
}

const DEFAULT_CONFIG: ContextGuardConfig = {
  maxContextTokens: 200_000,
  reservedForOutput: 8_192,
  maxConversationTurns: 50,
};

export class ContextGuard {
  private readonly config: ContextGuardConfig;

  constructor(config: Partial<ContextGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  compact(messages: Message[]): Message[] {
    let result = [...messages];

    // Strategy 1: Limit total conversation turns
    if (result.length > this.config.maxConversationTurns) {
      result = result.slice(-this.config.maxConversationTurns);
    }

    // Strategy 2: Truncate old tool results (keep only last 10 turns' tool results intact)
    const recentToolCutoff = Math.max(0, result.length - 10);
    result = result.map((msg, i) => {
      if (msg.role === "tool" && i < recentToolCutoff) {
        return { ...msg, content: "[Tool result truncated]" };
      }
      return msg;
    });

    // Strategy 3: Truncate long tool results (> 2000 chars)
    // This applies to ALL tool results including recent ones — even preserved
    // recent tool results are capped at 2000 chars to prevent token blowup.
    result = result.map((msg) => {
      if (msg.role === "tool" && msg.content.length > 2000) {
        return { ...msg, content: msg.content.slice(0, 2000) + "... [truncated]" };
      }
      return msg;
    });

    // Strategy 4: Check total token budget
    const budget = this.config.maxContextTokens - this.config.reservedForOutput;
    let totalTokens = result.reduce(
      (sum, m) => sum + this.estimateTokens(m.content),
      0,
    );

    // If still over budget, drop oldest messages one by one
    while (totalTokens > budget && result.length > 1) {
      const removed = result.shift()!;
      totalTokens -= this.estimateTokens(removed.content);
    }

    return result;
  }
}
