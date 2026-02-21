# Fumadocs + web_search + http Tools — Design

**Date:** 2026-02-21
**Status:** Approved

## 1. Fumadocs Scaffolding

Fumadocs + Next.js doc site at `apps/docs/`. Deployed on Vercel.

### Structure

```
apps/docs/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # redirect → /docs
│   └── docs/[[...slug]]/
│       └── page.tsx
├── content/docs/
│   ├── index.mdx             # Getting Started
│   ├── configuration.mdx
│   ├── architecture.mdx
│   ├── memory.mdx
│   ├── tools/
│   │   ├── index.mdx
│   │   ├── memory.mdx
│   │   ├── schedule.mdx
│   │   ├── web-search.mdx
│   │   └── http.mdx
│   ├── scheduler.mdx
│   └── deployment.mdx
├── next.config.mjs
├── package.json
└── tsconfig.json
```

### Content scope

Document what exists (M0+M1): config loader, agent loop, memory system (store, ingester, retriever), scheduler (cron, heartbeat, job persistence), tool registry, tool implementations. No aspirational docs — only what works today.

### Hosting

Vercel. `vercel.json` configured for `apps/docs/` root directory.

### Turbo integration

Workspace `apps/docs` with `build`/`dev` tasks. No build dependency on other packages (docs are independent of code packages).

---

## 2. web_search Tool

### Config

```typescript
// Added to ToolsConfig
webSearch?: {
  provider: "tavily" | "exa" | "searxng";
  apiKey?: string;        // required for tavily/exa
  baseUrl?: string;       // required for searxng (self-hosted URL)
  maxResults?: number;    // default: 5
};
```

### Architecture

Provider adapter pattern:

```
web_search tool
  └── resolveProvider(config) → SearchProvider
        ├── TavilyProvider   → POST https://api.tavily.com/search
        ├── ExaProvider       → POST https://api.exa.ai/search
        └── SearxngProvider  → GET  {baseUrl}/search?format=json
```

### Interface

```typescript
interface SearchProvider {
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

### Tool parameters (LLM-facing)

```json
{
  "query": "string (required) — the search query",
  "maxResults": "number (optional, default from config)"
}
```

### Output

Formatted markdown list of results: `**Title** — snippet\nURL`

---

## 3. http Tool

### Config

```typescript
// Added to ToolsConfig
http?: {
  defaultHeaders?: Record<string, string>;
  presets?: Record<string, {
    baseUrl: string;
    headers: Record<string, string>;  // auth via ${ENV_VAR}
  }>;
  timeoutMs?: number;              // default: 10_000
  maxResponseBytes?: number;       // default: 1MB (1_048_576)
};
```

### Security model

- Methods: GET and POST only
- Auth: injected from config presets, never passed by the LLM
- Response size: capped at maxResponseBytes to prevent memory issues
- Timeout: configurable, default 10s
- LLM sees response body (truncated if too large), status code, and content-type

### Tool parameters (LLM-facing)

```json
{
  "method": "GET | POST (required)",
  "url": "string (required) — full URL or path if preset used",
  "preset": "string (optional) — config preset name for auth/baseUrl injection",
  "body": "object (optional, POST only) — JSON body",
  "headers": "object (optional) — additional headers (no auth here)"
}
```

### Output

```
Status: 200 OK
Content-Type: application/json

{response body, truncated to ~4000 chars if needed}
```

---

## 4. Type changes needed

### ToolsConfig update

```typescript
export interface ToolsConfig {
  webSearch?: {
    provider: "tavily" | "exa" | "searxng";
    apiKey?: string;
    baseUrl?: string;
    maxResults?: number;
  };
  http?: {
    defaultHeaders?: Record<string, string>;
    presets?: Record<string, {
      baseUrl: string;
      headers: Record<string, string>;
    }>;
    timeoutMs?: number;
    maxResponseBytes?: number;
  };
  email?: { /* existing */ };
  github?: { /* existing */ };
}
```

### Zod schema update

Config validation in `packages/core/src/config.ts` needs matching zod schema updates.
