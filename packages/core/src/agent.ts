import type { LLMClient, Message, IncomingMessage, Logger } from "@augure/types";
import { noopLogger } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import type { MemoryIngester, MemoryRetriever } from "@augure/memory";
import { createCodeModeTool } from "@augure/code-mode";
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
  logger?: Logger;
  codeModeExecutor?: import("@augure/code-mode").CodeModeExecutor;
}

export class Agent {
  private readonly config: AgentConfig;
  private readonly log: Logger;
  private conversations: Map<string, Message[]> = new Map();
  private state: AgentState = "running";

  constructor(config: AgentConfig) {
    this.config = config;
    this.log = config.logger ?? noopLogger;
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
    const userId = incoming.userId;

    // Get or create conversation history for this user
    let history = this.conversations.get(userId) ?? [];

    history.push({
      role: "user",
      content: incoming.text,
    });

    // Apply context guard if configured
    if (this.config.guard) {
      history = this.config.guard.compact(history);
    }

    this.conversations.set(userId, history);

    // Use dynamic retrieval if available, otherwise fall back to static string
    let memoryContent = this.config.memoryContent;
    if (this.config.retriever) {
      memoryContent = await this.config.retriever.retrieve();
    }

    const maxLoops = this.config.maxToolLoops ?? 10;
    let loopCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalToolCalls = 0;

    const toolSchemas = this.config.tools.toFunctionSchemas();

    let effectiveSchemas = toolSchemas;
    let codeModeTool: import("@augure/types").NativeTool | undefined;

    // Code Mode: when enabled, the LLM sees a single execute_code tool instead of
    // individual tools. The LLM writes TypeScript that calls typed APIs (auto-generated
    // from the ToolRegistry) and executes in a sandbox. Individual tools remain accessible
    // inside the code via the `api.*` proxy.
    if (this.config.codeModeExecutor) {
      codeModeTool = createCodeModeTool(this.config.tools, this.config.codeModeExecutor);
      effectiveSchemas = [{
        type: "function" as const,
        function: {
          name: codeModeTool.name,
          description: codeModeTool.description,
          parameters: codeModeTool.parameters,
        },
      }];
    }

    while (loopCount < maxLoops) {
      const messages = assembleContext({
        systemPrompt: this.config.systemPrompt,
        memoryContent,
        conversationHistory: history,
        persona: this.config.persona,
      });

      this.log.debug(`LLM call #${loopCount + 1} (${messages.length} messages)`);
      const response = await this.config.llm.chat(messages, effectiveSchemas);
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      if (response.toolCalls.length === 0) {
        history.push({
          role: "assistant",
          content: response.content,
        });

        this.log.debug(
          `Response: ${response.usage.inputTokens}+${response.usage.outputTokens} tokens, ${Date.now() - start}ms`,
        );

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

        this.log.info(
          `── ${totalInputTokens}+${totalOutputTokens} tokens | ${loopCount + 1} LLM calls | ${totalToolCalls} tool calls | ${Date.now() - start}ms`,
        );

        // Trigger ingestion in background (don't block response)
        if (this.config.ingester) {
          this.config.ingester
            .ingest(history)
            .catch((err) => this.log.error("Ingestion error:", err));
        }

        return response.content;
      }

      history.push({
        role: "assistant",
        content: response.content || "",
        toolCalls: response.toolCalls,
      });

      totalToolCalls += response.toolCalls.length;
      for (const toolCall of response.toolCalls) {
        const toolStart = Date.now();
        this.log.debug(`Tool: ${toolCall.name}`);

        let result: import("@augure/types").ToolResult;
        if (codeModeTool && toolCall.name === "execute_code") {
          // execute_code doesn't use ToolContext — it routes calls internally via the bridge
          result = await codeModeTool.execute(toolCall.arguments, {} as import("@augure/types").ToolContext);
        } else {
          result = await this.config.tools.execute(
            toolCall.name,
            toolCall.arguments,
          );
        }
        this.log.debug(`Tool ${toolCall.name}: ${result.success ? "ok" : "fail"} (${Date.now() - toolStart}ms)`);
        history.push({
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

  getConversationHistory(userId?: string): Message[] {
    if (userId) {
      return [...(this.conversations.get(userId) ?? [])];
    }
    const all: Message[] = [];
    for (const msgs of this.conversations.values()) {
      all.push(...msgs);
    }
    return all;
  }

  clearHistory(userId?: string): void {
    if (userId) {
      this.conversations.delete(userId);
    } else {
      this.conversations.clear();
    }
  }
}
