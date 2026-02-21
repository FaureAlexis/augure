# Fumadocs + web_search + http Tools — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Fumadocs documentation site with M0-M1 content, web_search tool (Tavily/Exa/SearXNG), and http tool (GET/POST with config presets).

**Architecture:** Three independent workstreams: (1) Fumadocs scaffolding in `apps/docs/` with MDX content, (2) web_search tool with provider adapter pattern in `packages/tools/`, (3) http tool with config-injected auth. All share a ToolsConfig type update as the only dependency.

**Tech Stack:** Next.js 16, Fumadocs (fumadocs-core, fumadocs-ui, fumadocs-mdx), Tailwind CSS 4, vitest, msw (for HTTP mocking in tests)

---

### Task 1: Update ToolsConfig types and zod schema

**Context:** The current `ToolsConfig` only has `webSearch` with `"tavily" | "searxng"` and no `http` section. We need to add Exa as a provider and add the full http config with presets.

**Files:**
- Modify: `packages/types/src/config.ts`
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/__tests__/config.test.ts`

**Step 1: Update the TypeScript interface**

In `packages/types/src/config.ts`, replace the `ToolsConfig` interface:

```typescript
export interface WebSearchConfig {
  provider: "tavily" | "exa" | "searxng";
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
}

export interface HttpPreset {
  baseUrl: string;
  headers: Record<string, string>;
}

export interface HttpConfig {
  defaultHeaders?: Record<string, string>;
  presets?: Record<string, HttpPreset>;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface ToolsConfig {
  webSearch?: WebSearchConfig;
  http?: HttpConfig;
  email?: {
    imap: { host: string; port: number; user: string; password: string };
    smtp: { host: string; port: number; user: string; password: string };
  };
  github?: {
    token: string;
  };
}
```

**Step 2: Update the zod schema in `packages/core/src/config.ts`**

Replace the `tools` section of `AppConfigSchema`:

```typescript
  tools: z.object({
    webSearch: z
      .object({
        provider: z.enum(["tavily", "exa", "searxng"]),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        maxResults: z.number().int().positive().optional(),
      })
      .optional(),
    http: z
      .object({
        defaultHeaders: z.record(z.string()).optional(),
        presets: z
          .record(
            z.object({
              baseUrl: z.string(),
              headers: z.record(z.string()),
            }),
          )
          .optional(),
        timeoutMs: z.number().int().positive().optional(),
        maxResponseBytes: z.number().int().positive().optional(),
      })
      .optional(),
    email: z
      .object({
        imap: z.object({
          host: z.string(),
          port: z.number(),
          user: z.string(),
          password: z.string(),
        }),
        smtp: z.object({
          host: z.string(),
          port: z.number(),
          user: z.string(),
          password: z.string(),
        }),
      })
      .optional(),
    github: z.object({ token: z.string() }).optional(),
  }),
```

**Step 3: Run tests to verify nothing breaks**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm turbo test`
Expected: All 78 tests still pass, build succeeds.

**Step 4: Commit**

```bash
git add packages/types/src/config.ts packages/core/src/config.ts
git commit -m "feat(types): add Exa provider and http config to ToolsConfig"
```

---

### Task 2: web_search tool — SearchProvider interface + adapters

**Context:** The web_search tool uses a provider adapter pattern. Each provider (Tavily, Exa, SearXNG) implements a common `SearchProvider` interface. The tool resolves the right adapter from `ctx.config.tools.webSearch.provider`.

**Files:**
- Create: `packages/tools/src/web-search.ts`
- Create: `packages/tools/src/__tests__/web-search.test.ts`
- Modify: `packages/tools/src/index.ts`

**Step 1: Write the failing test**

Create `packages/tools/src/__tests__/web-search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webSearchTool } from "../web-search.js";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

// Mock global fetch
const mockFetch = vi.fn();

function makeCtx(
  provider: "tavily" | "exa" | "searxng" = "tavily",
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

describe("webSearchTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("should search with Tavily provider", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: "Result 1", url: "https://example.com/1", content: "Snippet 1" },
          { title: "Result 2", url: "https://example.com/2", content: "Snippet 2" },
        ],
      }),
    });

    const result = await webSearchTool.execute({ query: "test query" }, makeCtx("tavily"));
    expect(result.success).toBe(true);
    expect(result.output).toContain("Result 1");
    expect(result.output).toContain("https://example.com/1");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("should search with Exa provider", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: "Exa Result", url: "https://exa.ai/r1", text: "Exa snippet" },
        ],
      }),
    });

    const result = await webSearchTool.execute({ query: "test" }, makeCtx("exa"));
    expect(result.success).toBe(true);
    expect(result.output).toContain("Exa Result");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.exa.ai/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
        }),
      }),
    );
  });

  it("should search with SearXNG provider", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: "SearXNG Result", url: "https://searx.example.com/r1", content: "Snippet" },
        ],
      }),
    });

    const ctx = makeCtx("searxng", undefined, "https://searx.example.com");
    const result = await webSearchTool.execute({ query: "test" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("SearXNG Result");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://searx.example.com/search"),
      expect.any(Object),
    );
  });

  it("should return error when webSearch not configured", async () => {
    const ctx = {
      config: { tools: {} } as ToolContext["config"],
      memory: {} as MemoryStore,
      scheduler: {} as Scheduler,
    };
    const result = await webSearchTool.execute({ query: "test" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("not configured");
  });

  it("should return error on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const result = await webSearchTool.execute({ query: "test" }, makeCtx("tavily"));
    expect(result.success).toBe(false);
    expect(result.output).toContain("401");
  });

  it("should respect maxResults override", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await webSearchTool.execute({ query: "test", maxResults: 10 }, makeCtx("tavily"));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_results).toBe(10);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/alexis/lab/augure && pnpm --filter @augure/tools test`
Expected: FAIL — `webSearchTool` not found.

**Step 3: Write the implementation**

Create `packages/tools/src/web-search.ts`:

```typescript
import type { NativeTool } from "@augure/types";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchTavily(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, max_results: maxResults }),
  });
  if (!res.ok) throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return (data.results ?? []).map((r: { title: string; url: string; content: string }) => ({
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
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: maxResults,
      contents: { text: { maxCharacters: 300 } },
    }),
  });
  if (!res.ok) throw new Error(`Exa API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return (data.results ?? []).map((r: { title: string; url: string; text?: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.text ?? "",
  }));
}

async function searchSearxng(
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
  if (!res.ok) throw new Error(`SearXNG error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return (data.results ?? [])
    .slice(0, maxResults)
    .map((r: { title: string; url: string; content: string }) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";
  return results
    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`)
    .join("\n\n");
}

export const webSearchTool: NativeTool = {
  name: "web_search",
  description: "Search the web using the configured search provider (Tavily, Exa, or SearXNG)",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results (default: from config or 5)",
      },
    },
    required: ["query"],
  },
  execute: async (params, ctx) => {
    const { query, maxResults: maxResultsParam } = params as {
      query: string;
      maxResults?: number;
    };

    const wsConfig = ctx.config.tools?.webSearch;
    if (!wsConfig) {
      return { success: false, output: "web_search is not configured in tools.webSearch" };
    }

    const maxResults = maxResultsParam ?? wsConfig.maxResults ?? 5;

    try {
      let results: SearchResult[];
      switch (wsConfig.provider) {
        case "tavily":
          results = await searchTavily(query, maxResults, wsConfig.apiKey!);
          break;
        case "exa":
          results = await searchExa(query, maxResults, wsConfig.apiKey!);
          break;
        case "searxng":
          results = await searchSearxng(query, maxResults, wsConfig.baseUrl!);
          break;
        default:
          return { success: false, output: `Unknown search provider: ${wsConfig.provider}` };
      }
      return { success: true, output: formatResults(results) };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
```

**Step 4: Export from index.ts**

Add to `packages/tools/src/index.ts`:

```typescript
export { webSearchTool } from "./web-search.js";
```

**Step 5: Run tests**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: All web-search tests pass.

**Step 6: Commit**

```bash
git add packages/tools/src/web-search.ts packages/tools/src/__tests__/web-search.test.ts packages/tools/src/index.ts
git commit -m "feat(tools): add web_search tool with Tavily, Exa, and SearXNG providers"
```

---

### Task 3: http tool

**Context:** The http tool does GET/POST requests with auth injected from config presets. The LLM never passes credentials directly — it references a preset name and the tool injects headers/baseUrl from `ctx.config.tools.http.presets`.

**Files:**
- Create: `packages/tools/src/http.ts`
- Create: `packages/tools/src/__tests__/http-tool.test.ts`
- Modify: `packages/tools/src/index.ts`

**Step 1: Write the failing test**

Create `packages/tools/src/__tests__/http-tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpTool } from "../http.js";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

const mockFetch = vi.fn();

function makeCtx(httpConfig?: ToolContext["config"]["tools"]["http"]): ToolContext {
  return {
    config: {
      tools: { http: httpConfig },
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
  };
}

describe("httpTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("should perform a simple GET request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Map([["content-type", "application/json"]]),
      text: async () => '{"data":"hello"}',
    });

    const result = await httpTool.execute(
      { method: "GET", url: "https://api.example.com/data" },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("200");
    expect(result.output).toContain('"data":"hello"');
  });

  it("should perform a POST request with body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: "Created",
      headers: new Map([["content-type", "application/json"]]),
      text: async () => '{"id":1}',
    });

    const result = await httpTool.execute(
      { method: "POST", url: "https://api.example.com/items", body: { name: "test" } },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    const fetchCall = mockFetch.mock.calls[0];
    expect(JSON.parse(fetchCall[1].body)).toEqual({ name: "test" });
  });

  it("should inject preset headers and baseUrl", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Map([["content-type", "application/json"]]),
      text: async () => '{"ok":true}',
    });

    const ctx = makeCtx({
      presets: {
        github: {
          baseUrl: "https://api.github.com",
          headers: { Authorization: "Bearer ghp_secret123" },
        },
      },
    });

    const result = await httpTool.execute(
      { method: "GET", url: "/repos/user/repo", preset: "github" },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/user/repo",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_secret123",
        }),
      }),
    );
  });

  it("should reject unknown presets", async () => {
    const result = await httpTool.execute(
      { method: "GET", url: "/test", preset: "nonexistent" },
      makeCtx({ presets: {} }),
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain("nonexistent");
  });

  it("should reject methods other than GET/POST", async () => {
    const result = await httpTool.execute(
      { method: "DELETE", url: "https://example.com/resource" },
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain("GET or POST");
  });

  it("should truncate large responses", async () => {
    const largeBody = "x".repeat(5000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Map([["content-type", "text/plain"]]),
      text: async () => largeBody,
    });

    const ctx = makeCtx({ maxResponseBytes: 1000 });
    const result = await httpTool.execute(
      { method: "GET", url: "https://example.com/large" },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("[truncated]");
    expect(result.output.length).toBeLessThan(largeBody.length);
  });

  it("should handle fetch errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await httpTool.execute(
      { method: "GET", url: "https://example.com/fail" },
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain("Network error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/alexis/lab/augure && pnpm --filter @augure/tools test`
Expected: FAIL — `httpTool` not found.

**Step 3: Write the implementation**

Create `packages/tools/src/http.ts`:

```typescript
import type { NativeTool } from "@augure/types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576; // 1MB
const MAX_OUTPUT_CHARS = 4000;

export const httpTool: NativeTool = {
  name: "http",
  description:
    "Make HTTP requests (GET or POST). Use a preset name to inject auth headers from config.",
  parameters: {
    type: "object",
    properties: {
      method: {
        type: "string",
        enum: ["GET", "POST"],
        description: "HTTP method",
      },
      url: {
        type: "string",
        description: "Full URL, or path if using a preset (preset baseUrl is prepended)",
      },
      preset: {
        type: "string",
        description: "Config preset name for auth injection (e.g. 'github', 'notion')",
      },
      body: {
        type: "object",
        description: "JSON body (POST only)",
      },
      headers: {
        type: "object",
        description: "Additional headers (do NOT put auth here — use a preset)",
      },
    },
    required: ["method", "url"],
  },
  execute: async (params, ctx) => {
    const { method, url, preset, body, headers: extraHeaders } = params as {
      method: string;
      url: string;
      preset?: string;
      body?: Record<string, unknown>;
      headers?: Record<string, string>;
    };

    if (method !== "GET" && method !== "POST") {
      return { success: false, output: "Only GET or POST methods are allowed" };
    }

    const httpConfig = ctx.config.tools?.http;
    const timeoutMs = httpConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResponseBytes = httpConfig?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

    // Resolve preset
    let finalUrl = url;
    const mergedHeaders: Record<string, string> = {
      ...httpConfig?.defaultHeaders,
      ...extraHeaders,
    };

    if (preset) {
      const presetConfig = httpConfig?.presets?.[preset];
      if (!presetConfig) {
        return { success: false, output: `Unknown preset: "${preset}". Configure it in tools.http.presets.` };
      }
      finalUrl = url.startsWith("http") ? url : `${presetConfig.baseUrl}${url}`;
      Object.assign(mergedHeaders, presetConfig.headers);
    }

    if (body) {
      mergedHeaders["Content-Type"] = "application/json";
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(finalUrl, {
        method,
        headers: mergedHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      let text = await res.text();
      if (text.length > maxResponseBytes) {
        text = text.slice(0, MAX_OUTPUT_CHARS) + "\n[truncated]";
      } else if (text.length > MAX_OUTPUT_CHARS) {
        text = text.slice(0, MAX_OUTPUT_CHARS) + "\n[truncated]";
      }

      const contentType = res.headers.get?.("content-type") ?? "unknown";
      const output = `Status: ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\n${text}`;

      return { success: res.ok, output };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
```

**Step 4: Export from index.ts**

Add to `packages/tools/src/index.ts`:

```typescript
export { httpTool } from "./http.js";
```

**Step 5: Run tests**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: All http-tool tests pass.

**Step 6: Commit**

```bash
git add packages/tools/src/http.ts packages/tools/src/__tests__/http-tool.test.ts packages/tools/src/index.ts
git commit -m "feat(tools): add http tool with config preset auth injection"
```

---

### Task 4: Wire new tools in main.ts

**Context:** Register `webSearchTool` and `httpTool` in the agent startup, same as existing tools.

**Files:**
- Modify: `packages/core/src/main.ts`

**Step 1: Add imports and registrations**

In `packages/core/src/main.ts`, add imports:

```typescript
import {
  ToolRegistry,
  memoryReadTool,
  memoryWriteTool,
  scheduleTool,
  webSearchTool,
  httpTool,
} from "@augure/tools";
```

And add registrations after existing ones:

```typescript
  tools.register(webSearchTool);
  tools.register(httpTool);
```

**Step 2: Build and verify**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm turbo test`
Expected: All tests pass, build succeeds.

**Step 3: Commit**

```bash
git add packages/core/src/main.ts
git commit -m "feat(core): register web_search and http tools"
```

---

### Task 5: Fumadocs scaffolding

**Context:** Create the documentation site at `apps/docs/` using Fumadocs with Next.js 16 + Tailwind CSS 4. Manual installation approach since we're adding to an existing monorepo. The workspace must be added to `pnpm-workspace.yaml`.

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `apps/docs/package.json`
- Create: `apps/docs/tsconfig.json`
- Create: `apps/docs/next.config.mjs`
- Create: `apps/docs/source.config.ts`
- Create: `apps/docs/lib/source.ts`
- Create: `apps/docs/lib/layout.shared.tsx`
- Create: `apps/docs/app/layout.tsx`
- Create: `apps/docs/app/global.css`
- Create: `apps/docs/app/page.tsx`
- Create: `apps/docs/app/docs/layout.tsx`
- Create: `apps/docs/app/docs/[[...slug]]/page.tsx`
- Create: `apps/docs/mdx-components.tsx`
- Create: `apps/docs/content/docs/index.mdx` (placeholder to verify build)

**Step 1: Update pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

**Step 2: Create `apps/docs/package.json`**

```json
{
  "name": "@augure/docs",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "fumadocs-core": "^16.0.0",
    "fumadocs-mdx": "^16.0.0",
    "fumadocs-ui": "^16.0.0",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/mdx": "^2.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Create `apps/docs/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "noEmit": true,
    "lib": ["dom", "dom.iterable", "esnext"],
    "paths": {
      "@/*": ["./*"],
      "fumadocs-mdx:collections/*": [".source/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".source/**/*.ts",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

**Step 4: Create `apps/docs/next.config.mjs`**

```javascript
import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
};

const withMDX = createMDX({});

export default withMDX(config);
```

**Step 5: Create `apps/docs/source.config.ts`**

```typescript
import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
```

**Step 6: Create `apps/docs/lib/source.ts`**

```typescript
import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
```

**Step 7: Create `apps/docs/lib/layout.shared.tsx`**

```typescript
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Augure",
    },
  };
}
```

**Step 8: Create `apps/docs/app/layout.tsx`**

```typescript
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import "./global.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
```

**Step 9: Create `apps/docs/app/global.css`**

```css
@import "tailwindcss";
@import "fumadocs-ui/css/neutral.css";
@import "fumadocs-ui/css/preset.css";
```

**Step 10: Create `apps/docs/app/page.tsx`**

```typescript
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/docs");
}
```

**Step 11: Create `apps/docs/app/docs/layout.tsx`**

```typescript
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
```

**Step 12: Create `apps/docs/app/docs/[[...slug]]/page.tsx`**

```typescript
import { source } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/mdx-components";
import { createRelativeLink } from "fumadocs-ui/mdx";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
```

**Step 13: Create `apps/docs/mdx-components.tsx`**

```typescript
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...components,
  };
}
```

**Step 14: Create placeholder content**

Create `apps/docs/content/docs/index.mdx`:

```mdx
---
title: Getting Started
description: Deploy your own AI agent that runs 24/7
---

## What is Augure?

Augure is an open-source personal AI agent designed to run continuously on a server.

It connects to your messaging apps, learns your preferences over time, executes tasks proactively on a schedule, and can spin up isolated sandboxes for complex work.

## Quick Start

Coming soon — see [Configuration](/docs/configuration) to understand the config file.
```

**Step 15: Install dependencies and verify build**

```bash
cd /Users/alexis/lab/augure && pnpm install
cd apps/docs && pnpm build
```

Expected: Build succeeds, docs site is generated.

**Step 16: Commit**

```bash
git add pnpm-workspace.yaml apps/docs/
git commit -m "feat(docs): scaffold Fumadocs site with Next.js 16"
```

---

### Task 6: Documentation content — M0+M1 features

**Context:** Write the actual documentation content for everything built in M0 and M1. Each page is a standalone MDX file in `apps/docs/content/docs/`.

**Files:**
- Create/Replace: `apps/docs/content/docs/index.mdx` (Getting Started)
- Create: `apps/docs/content/docs/configuration.mdx`
- Create: `apps/docs/content/docs/architecture.mdx`
- Create: `apps/docs/content/docs/memory.mdx`
- Create: `apps/docs/content/docs/scheduler.mdx`
- Create: `apps/docs/content/docs/tools/index.mdx`
- Create: `apps/docs/content/docs/tools/memory.mdx`
- Create: `apps/docs/content/docs/tools/schedule.mdx`
- Create: `apps/docs/content/docs/tools/web-search.mdx`
- Create: `apps/docs/content/docs/tools/http.mdx`
- Create: `apps/docs/content/docs/deployment.mdx`
- Create: `apps/docs/content/docs/meta.json` (page ordering)

**Content guidelines:**
- Document ONLY what exists and works today
- Include code examples from actual source files
- Include config snippets from the actual JSON5 schema
- Keep each page focused: what it does, how to configure it, how it works internally
- French-friendly: the project is bilingual, but docs are in English

**Page content outline:**

**`index.mdx`** (Getting Started): What Augure is, core principles (filesystem-first, readable, secure, proactive, cost-aware), quick start with Docker Compose, link to configuration.

**`configuration.mdx`**: Full augure.json5 reference. Every section (identity, llm, channels, memory, scheduler, tools, sandbox, security) with examples. Env var interpolation. Per-usage model routing.

**`architecture.mdx`**: 6 primitives diagram, package structure table, execution flow (native tools vs OpenCode), context window assembly order.

**`memory.mdx`**: FileMemoryStore (read/write/append/list), directory structure, MemoryIngester (how observations are extracted), MemoryRetriever (priority ordering, token budget), temporal awareness.

**`scheduler.mdx`**: CronScheduler, JobStore persistence, Heartbeat system, parseInterval, config-defined jobs vs runtime jobs.

**`tools/index.mdx`**: Tool system overview, NativeTool interface, ToolRegistry, ToolContext, how tools are registered and called by the LLM.

**`tools/memory.mdx`**: memory_read and memory_write tools, parameters, examples.

**`tools/schedule.mdx`**: schedule tool, create/delete/list actions, parameters.

**`tools/web-search.mdx`**: web_search tool, provider configuration (Tavily/Exa/SearXNG), parameters, output format.

**`tools/http.mdx`**: http tool, preset system, security model (auth injection), parameters, output format.

**`deployment.mdx`**: Docker Compose setup, .env file, VPS requirements, security defaults (no inbound ports), Vercel for docs.

**`meta.json`**: Controls page ordering in the sidebar.

```json
{
  "pages": [
    "---Getting Started---",
    "index",
    "configuration",
    "architecture",
    "---Features---",
    "memory",
    "scheduler",
    "tools",
    "---Operations---",
    "deployment"
  ]
}
```

**Step 1: Write all content files** (one file at a time, build after each to verify)

**Step 2: Verify build**

```bash
cd /Users/alexis/lab/augure/apps/docs && pnpm build
```

Expected: Build succeeds with all pages rendered.

**Step 3: Commit**

```bash
git add apps/docs/content/
git commit -m "docs: add M0+M1 documentation content"
```

---

### Task 7: Final verification

**Step 1: Full build + test suite**

```bash
cd /Users/alexis/lab/augure
pnpm turbo build
pnpm turbo test
pnpm turbo typecheck
```

Expected: All packages build, all tests pass, zero type errors.

**Step 2: Verify docs build**

```bash
cd /Users/alexis/lab/augure/apps/docs && pnpm build
```

Expected: Next.js build succeeds.

**Step 3: Final commit if any loose changes**

```bash
git log --oneline -10
```

Verify clean git state with all work committed.
