import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webSearchTool } from "../web-search.js";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

function makeCtx(
  provider = "tavily",
  apiKey = "test-key",
  baseUrl?: string,
): ToolContext {
  return {
    config: {
      tools: {
        webSearch: { provider, apiKey, baseUrl, maxResults: 3 },
      },
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
  };
}

const tavilyResponse = {
  results: [
    { title: "Result 1", url: "https://example.com/1", content: "Snippet 1" },
    { title: "Result 2", url: "https://example.com/2", content: "Snippet 2" },
  ],
};

const exaResponse = {
  results: [
    { title: "Exa 1", url: "https://exa.ai/1", text: "Exa snippet 1" },
    { title: "Exa 2", url: "https://exa.ai/2", text: "Exa snippet 2" },
  ],
};

const searxngResponse = {
  results: [
    { title: "SearX 1", url: "https://searx.example/1", content: "SearX snippet 1" },
    { title: "SearX 2", url: "https://searx.example/2", content: "SearX snippet 2" },
    { title: "SearX 3", url: "https://searx.example/3", content: "SearX snippet 3" },
    { title: "SearX 4", url: "https://searx.example/4", content: "SearX snippet 4" },
  ],
};

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webSearchTool", () => {
  it("should search with Tavily provider", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(tavilyResponse),
    });

    const ctx = makeCtx("tavily", "tv-key");
    const result = await webSearchTool.execute({ query: "test query" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("1. **Result 1**");
    expect(result.output).toContain("Snippet 1");
    expect(result.output).toContain("https://example.com/1");
    expect(result.output).toContain("2. **Result 2**");

    expect(mockFetch).toHaveBeenCalledWith("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: "Bearer tv-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "test query", max_results: 3 }),
    });
  });

  it("should search with Exa provider", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(exaResponse),
    });

    const ctx = makeCtx("exa", "exa-key");
    const result = await webSearchTool.execute({ query: "exa query" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("1. **Exa 1**");
    expect(result.output).toContain("Exa snippet 1");

    expect(mockFetch).toHaveBeenCalledWith("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": "exa-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "exa query",
        numResults: 3,
        contents: { text: { maxCharacters: 300 } },
      }),
    });
  });

  it("should search with SearXNG provider", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(searxngResponse),
    });

    const ctx = makeCtx("searxng", undefined, "https://searx.local");
    const result = await webSearchTool.execute({ query: "searx query" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("1. **SearX 1**");
    expect(result.output).toContain("3. **SearX 3**");
    expect(result.output).not.toContain("SearX 4");

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://searx.local/search");
    expect(url).toContain("q=searx+query");
    expect(url).toContain("format=json");
    expect(url).toContain("pageno=1");
    expect(opts.method).toBe("GET");
    expect((opts.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("should return error when not configured", async () => {
    const ctx: ToolContext = {
      config: { tools: {} } as ToolContext["config"],
      memory: {} as MemoryStore,
      scheduler: {} as Scheduler,
    };

    const result = await webSearchTool.execute({ query: "test" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("web_search is not configured");
  });

  it("should return error on fetch failure (401)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const ctx = makeCtx("tavily", "bad-key");
    const result = await webSearchTool.execute({ query: "test" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("401");
    expect(result.output).toContain("Unauthorized");
  });

  it("should use maxResults override from params", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(tavilyResponse),
    });

    const ctx = makeCtx("tavily", "tv-key");
    const result = await webSearchTool.execute(
      { query: "test", maxResults: 10 },
      ctx,
    );

    expect(result.success).toBe(true);
    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.max_results).toBe(10);
  });
});
