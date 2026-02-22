import type { LLMClient, LLMResponse, Message, FunctionSchema, Logger } from "@augure/types";
import { noopLogger } from "@augure/types";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl?: string;
  logger?: Logger;
}

export class OpenRouterClient implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly baseUrl: string;
  private readonly log: Logger;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.baseUrl = config.baseUrl ?? "https://openrouter.ai/api/v1";
    this.log = config.logger ?? noopLogger;
  }

  async chat(messages: Message[], tools?: FunctionSchema[]): Promise<LLMResponse> {
    this.log.debug(`Request: model=${this.model} messages=${messages.length} tools=${tools?.length ?? 0}`);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.arguments),
                  },
                })),
              }
            : {}),
        })),
        ...(tools?.length ? { tools } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenRouter API error ${response.status}: ${body}`,
      );
    }

    const data = (await response.json()) as OpenRouterResponse;
    const choice = data.choices[0];

    this.log.debug(
      `Response: ${response.status} ${data.usage.prompt_tokens}+${data.usage.completion_tokens} tokens`,
    );

    return {
      content: choice.message.content ?? "",
      toolCalls: (choice.message.tool_calls ?? []).map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          this.log.warn(`Failed to parse tool call arguments for ${tc.function.name}`);
        }
        return { id: tc.id, name: tc.function.name, arguments: args };
      }),
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string | null;
      tool_calls?: {
        id: string;
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
