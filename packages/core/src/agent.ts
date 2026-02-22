import type { LLMClient, Message, IncomingMessage } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import type { MemoryIngester, MemoryRetriever } from "@augure/memory";
import { assembleContext } from "./context.js";
import { summarize } from "./audit.js";
import type { AuditLogger } from "./audit.js";
import type { ContextGuard } from "./context-guard.js";
import type { AgentState } from "./commands.js";

export interface AgentConfig {
  llm: LLMClient;
  tools: ToolRegistry;
  systemPrompt: string;
  memoryContent: string;
  persona?: string;
  maxToolLoops?: number;
  retriever?: MemoryRetriever;
  ingester?: MemoryIngester;
  audit?: AuditLogger;
  guard?: ContextGuard;
  modelName?: string;
}

export class Agent {
  private readonly config: AgentConfig;
  private conversationHistory: Message[] = [];
  private state: AgentState = "running";

  constructor(config: AgentConfig) {
    this.config = config;
  }

  getState(): AgentState {
    return this.state;
  }

  setState(s: AgentState): void {
    this.state = s;
  }

  setPersona(text: string): void {
    this.config.persona = text;
  }

  async handleMessage(incoming: IncomingMessage): Promise<string> {
    if (this.state === "killed") {
      return "Agent is in emergency stop mode. Send /resume to reactivate.";
    }

    const start = Date.now();

    this.conversationHistory.push({
      role: "user",
      content: incoming.text,
    });

    // Apply context guard if configured
    if (this.config.guard) {
      this.conversationHistory = this.config.guard.compact(
        this.conversationHistory,
      );
    }

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

        // Audit: log the final chat response
        if (this.config.audit) {
          this.config.audit.log({
            ts: new Date().toISOString(),
            trigger: incoming.channelType === "system" ? "heartbeat" : "user",
            action: "chat",
            inputSummary: summarize(incoming.text),
            outputSummary: summarize(response.content),
            tokens: {
              input: response.usage.inputTokens,
              output: response.usage.outputTokens,
              model: this.config.modelName ?? "",
            },
            durationMs: Date.now() - start,
            success: true,
          });
        }

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
        const toolStart = Date.now();
        const result = await this.config.tools.execute(
          toolCall.name,
          toolCall.arguments,
        );
        this.conversationHistory.push({
          role: "tool",
          content: result.output,
          toolCallId: toolCall.id,
        });

        // Audit: log each tool call
        if (this.config.audit) {
          this.config.audit.log({
            ts: new Date().toISOString(),
            trigger: incoming.channelType === "system" ? "heartbeat" : "user",
            action: toolCall.name,
            inputSummary: summarize(JSON.stringify(toolCall.arguments)),
            outputSummary: summarize(result.output),
            durationMs: Date.now() - toolStart,
            success: result.success,
            error: result.success ? undefined : result.output,
          });
        }
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
