import type { LLMClient, Message, IncomingMessage } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import type { MemoryIngester, MemoryRetriever } from "@augure/memory";
import { assembleContext } from "./context.js";

export interface AgentConfig {
  llm: LLMClient;
  tools: ToolRegistry;
  systemPrompt: string;
  memoryContent: string;
  persona?: string;
  maxToolLoops?: number;
  retriever?: MemoryRetriever;
  ingester?: MemoryIngester;
}

export class Agent {
  private readonly config: AgentConfig;
  private conversationHistory: Message[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async handleMessage(incoming: IncomingMessage): Promise<string> {
    this.conversationHistory.push({
      role: "user",
      content: incoming.text,
    });

    // Use dynamic retrieval if available, otherwise fall back to static string
    let memoryContent = this.config.memoryContent;
    if (this.config.retriever) {
      memoryContent = await this.config.retriever.retrieve();
    }

    const maxLoops = this.config.maxToolLoops ?? 10;
    let loopCount = 0;

    while (loopCount < maxLoops) {
      const messages = assembleContext({
        systemPrompt: this.config.systemPrompt,
        memoryContent,
        toolSchemas: this.config.tools.toFunctionSchemas(),
        conversationHistory: this.conversationHistory,
        persona: this.config.persona,
      });

      const response = await this.config.llm.chat(messages);

      if (response.toolCalls.length === 0) {
        this.conversationHistory.push({
          role: "assistant",
          content: response.content,
        });

        // Trigger ingestion in background (don't block response)
        if (this.config.ingester) {
          this.config.ingester
            .ingest(this.conversationHistory)
            .catch((err) => console.error("[augure] Ingestion error:", err));
        }

        return response.content;
      }

      this.conversationHistory.push({
        role: "assistant",
        content: response.content || "",
      });

      for (const toolCall of response.toolCalls) {
        const result = await this.config.tools.execute(
          toolCall.name,
          toolCall.arguments,
        );
        this.conversationHistory.push({
          role: "tool",
          content: result.output,
          toolCallId: toolCall.id,
        });
      }

      loopCount++;
    }

    return "Max tool call loops reached. Please try again.";
  }

  getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
