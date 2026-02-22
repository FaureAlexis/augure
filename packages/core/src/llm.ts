import type { LLMClient, LLMResponse, Message, FunctionSchema } from "@augure/types";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl?: string;
}

export class OpenRouterClient implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly baseUrl: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.baseUrl = config.baseUrl ?? "https://openrouter.ai/api/v1";
  }

  async chat(messages: Message[], tools?: FunctionSchema[]): Promise<LLMResponse> {
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

    return {
      content: choice.message.content ?? "",
      toolCalls: (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<
          string,
          unknown
        >,
      })),
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
