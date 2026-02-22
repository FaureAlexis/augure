import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { OpenRouterClient } from "../llm.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE_URL = "http://localhost:9876";

function createClient(overrides?: { apiKey?: string }) {
  return new OpenRouterClient({
    apiKey: overrides?.apiKey ?? "test-key",
    model: "anthropic/claude-3.5-sonnet",
    maxTokens: 1024,
    baseUrl: BASE_URL,
  });
}

describe("OpenRouterClient", () => {
  it("should send messages and return a response", async () => {
    server.use(
      http.post(`${BASE_URL}/chat/completions`, () => {
        return HttpResponse.json({
          choices: [
            {
              message: {
                content: "Hello from the model!",
                tool_calls: [],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      }),
    );

    const client = createClient();
    const result = await client.chat([
      { role: "user", content: "Hi there" },
    ]);

    expect(result.content).toBe("Hello from the model!");
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("should parse tool calls from response", async () => {
    server.use(
      http.post(`${BASE_URL}/chat/completions`, () => {
        return HttpResponse.json({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call_123",
                    function: {
                      name: "get_weather",
                      arguments: JSON.stringify({
                        location: "Paris",
                        unit: "celsius",
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 20 },
        });
      }),
    );

    const client = createClient();
    const result = await client.chat([
      { role: "user", content: "What is the weather in Paris?" },
    ]);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      id: "call_123",
      name: "get_weather",
      arguments: { location: "Paris", unit: "celsius" },
    });
  });

  it("should send tools parameter in request body", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE_URL}/chat/completions`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          choices: [{ message: { content: "OK", tool_calls: [] } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      }),
    );

    const client = createClient();
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      },
    ];

    await client.chat([{ role: "user", content: "Weather?" }], tools);

    expect(capturedBody.tools).toEqual(tools);
  });

  it("should serialize tool_calls on assistant messages", async () => {
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE_URL}/chat/completions`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          choices: [{ message: { content: "Done", tool_calls: [] } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      }),
    );

    const client = createClient();
    await client.chat([
      { role: "user", content: "Use the tool" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_1", name: "my_tool", arguments: { key: "value" } },
        ],
      },
      { role: "tool", content: "tool result", toolCallId: "call_1" },
    ]);

    const messages = capturedBody.messages as Record<string, unknown>[];
    const assistantMsg = messages[1];
    expect(assistantMsg.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "my_tool", arguments: '{"key":"value"}' },
      },
    ]);
    expect(messages[2]).toEqual(
      expect.objectContaining({ role: "tool", tool_call_id: "call_1" }),
    );
  });

  it("should throw on API error", async () => {
    server.use(
      http.post(`${BASE_URL}/chat/completions`, () => {
        return HttpResponse.json(
          { error: { message: "Invalid API key" } },
          { status: 401 },
        );
      }),
    );

    const client = createClient({ apiKey: "bad-key" });

    await expect(
      client.chat([{ role: "user", content: "Hi" }]),
    ).rejects.toThrow("OpenRouter API error 401");
  });
});
