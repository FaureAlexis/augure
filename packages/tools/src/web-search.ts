import type { NativeTool } from "@augure/types";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const webSearchTool: NativeTool = {
  name: "web_search",
  description:
    "Search the web using the configured search provider (Tavily, Exa, or SearXNG)",
  configCheck: (ctx) =>
    ctx.config.tools?.webSearch
      ? null
      : "This tool requires configuration. See https://augure.dev/docs/tools/web-search",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      maxResults: {
        type: "number",
        description: "Max results (default: from config or 5)",
      },
    },
    required: ["query"],
  },
  execute: async (params, ctx) => {
    const { query, maxResults: maxResultsParam } = params as {
      query: string;
      maxResults?: number;
    };

    const cfg = ctx.config.tools?.webSearch;
    if (!cfg) {
      return {
        success: false,
        output: "web_search is not configured. Set tools.webSearch in your config.",
      };
    }

    const maxResults = maxResultsParam ?? cfg.maxResults ?? 5;

    try {
      let results: SearchResult[];

      switch (cfg.provider) {
        case "tavily":
          if (!cfg.apiKey) {
            return { success: false, output: "Tavily requires tools.webSearch.apiKey in config." };
          }
          results = await searchTavily(query, maxResults, cfg.apiKey);
          break;
        case "exa":
          if (!cfg.apiKey) {
            return { success: false, output: "Exa requires tools.webSearch.apiKey in config." };
          }
          results = await searchExa(query, maxResults, cfg.apiKey);
          break;
        case "searxng":
          if (!cfg.baseUrl) {
            return { success: false, output: "SearXNG requires tools.webSearch.baseUrl in config." };
          }
          results = await searchSearXNG(query, maxResults, cfg.baseUrl);
          break;
        default:
          return {
            success: false,
            output: `Unknown search provider: ${cfg.provider as string}`,
          };
      }

      if (results.length === 0) {
        return { success: true, output: "No results found." };
      }

      const formatted = results
        .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`)
        .join("\n\n");

      return { success: true, output: formatted };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

async function searchTavily(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, max_results: maxResults }),
  });

  if (!res.ok) {
    throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    results: { title: string; url: string; content: string }[];
  };

  return data.results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}

async function searchExa(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<SearchResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: maxResults,
      contents: { text: { maxCharacters: 300 } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Exa API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    results: { title: string; url: string; text: string }[];
  };

  return data.results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.text,
  }));
}

async function searchSearXNG(
  query: string,
  maxResults: number,
  baseUrl: string,
): Promise<SearchResult[]> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageno", "1");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`SearXNG API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    results: { title: string; url: string; content: string }[];
  };

  return data.results.slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}
