# Browser Tool Design

> Date: 2026-02-23
> Status: Approved
> Scope: New `@augure/browser` package + browser NativeTool + SkillContext integration

## Summary

Add browser automation to Augure via [Stagehand](https://github.com/browserbase/stagehand) (by Browserbase). Stagehand provides AI-powered browser actions using natural language (`act`, `extract`, `observe`) backed by Playwright, with support for local and cloud (Browserbase) execution.

Two integration surfaces:
1. **NativeTool** — The LLM calls `browser` tool with session-based actions
2. **SkillContext** — Skills access `ctx.browser` for programmatic browser automation

## Why Stagehand

- **Natural language actions**: `act("click the login button")` instead of fragile CSS selectors
- **Structured extraction**: `extract("get all prices", zodSchema)` returns typed data
- **Provider abstraction built-in**: `env: "LOCAL"` (Playwright) or `env: "BROWSERBASE"` (cloud)
- **Bring your own LLM**: pass Augure's OpenRouter config directly
- **Self-healing**: auto-retries on stale element errors
- **Zod schema support**: structured extraction with type safety

## Architecture

### Dependency Graph

```
@augure/types         <- BrowserConfig, SkillContext.browser
    |
@augure/browser       <- Stagehand wrapper, BrowserSessionManager (NEW)
    |
+-- @augure/tools     <- browser NativeTool
+-- @augure/skills    <- skill runner injects ctx.browser
+-- @augure/core      <- bootstrap, register, cleanup on shutdown
```

### Package: `@augure/browser`

```
packages/browser/
  src/
    index.ts              # Public exports
    session-manager.ts    # Session lifecycle (open/close/TTL)
    provider.ts           # Stagehand factory (local vs browserbase)
    __tests__/
      session-manager.test.ts
      provider.test.ts
  package.json
  tsconfig.json
```

## Interfaces

### Types (`@augure/types/src/browser.ts`)

```typescript
export interface BrowserConfig {
  provider: "local" | "browserbase";
  browserbase?: {
    apiKey: string;
    projectId?: string;
  };
  defaults?: {
    timeout?: number;                           // seconds, default: 30
    headless?: boolean;                         // default: true
    viewport?: { width: number; height: number }; // default: 1280x720
  };
}
```

Extend `ToolsConfig`:
```typescript
export interface ToolsConfig {
  // ... existing fields
  browser?: BrowserConfig;
}
```

Extend `SkillContext`:
```typescript
export interface SkillContext {
  // ... existing fields
  browser?: {
    navigate(url: string): Promise<void>;
    act(instruction: string, variables?: Record<string, string>): Promise<{ success: boolean; message: string }>;
    extract(instruction: string, schema?: Record<string, unknown>): Promise<unknown>;
    observe(instruction: string): Promise<Array<{ description: string; selector: string }>>;
    screenshot(): Promise<string>; // base64-encoded PNG
  };
}
```

### BrowserSessionManager (`@augure/browser`)

```typescript
export class BrowserSessionManager {
  private sessions: Map<string, { stagehand: Stagehand; timer: NodeJS.Timeout }>;
  private config: BrowserConfig;
  private llmConfig: LLMModelConfig;
  private ttlMs: number;
  private logger: Logger;

  constructor(opts: { config: BrowserConfig; llm: LLMModelConfig; ttlMs?: number; logger?: Logger });

  async open(url?: string): Promise<string>;  // returns sessionId, optionally navigate
  async navigate(sessionId: string, url: string): Promise<void>;
  async act(sessionId: string, instruction: string, variables?: Record<string, string>): Promise<{ success: boolean; message: string }>;
  async extract(sessionId: string, instruction: string, schema?: Record<string, unknown>): Promise<unknown>;
  async observe(sessionId: string, instruction: string): Promise<Array<{ description: string; selector: string }>>;
  async screenshot(sessionId: string): Promise<string>;  // base64
  async close(sessionId: string): Promise<void>;
  async closeAll(): Promise<void>;
}
```

Session lifecycle:
- `open()` creates a Stagehand instance, calls `init()`, starts a TTL timer (default: 120s)
- Every action resets the TTL timer
- `close()` destroys the Stagehand instance and removes from map
- `closeAll()` called on agent shutdown (graceful cleanup)
- TTL expiry auto-closes the session

### Stagehand Factory (`@augure/browser`)

```typescript
export function createStagehand(config: BrowserConfig, llm: LLMModelConfig, logger?: Logger): Stagehand {
  return new Stagehand({
    env: config.provider === "local" ? "LOCAL" : "BROWSERBASE",
    apiKey: config.browserbase?.apiKey,
    projectId: config.browserbase?.projectId,
    model: {
      modelName: llm.model,
      apiKey: llm.apiKey,
      baseURL: resolveBaseUrl(llm.provider),
    },
    localBrowserLaunchOptions: config.provider === "local" ? {
      headless: config.defaults?.headless ?? true,
      viewport: config.defaults?.viewport ?? { width: 1280, height: 720 },
    } : undefined,
    domSettleTimeout: (config.defaults?.timeout ?? 30) * 1000,
    verbose: 0,
    logger: logger ? (line) => logger.debug(line.message) : undefined,
  });
}
```

## NativeTool: `browser`

Registered in `@augure/tools/src/browser.ts`.

### Parameters (JSON Schema for LLM)

```typescript
{
  action: {
    type: "string",
    enum: ["open", "navigate", "act", "extract", "observe", "screenshot", "close"],
    description: "The browser action to perform"
  },
  session: {
    type: "string",
    description: "Session ID returned by 'open'. Required for all actions except 'open'."
  },
  url: {
    type: "string",
    description: "URL to navigate to. Used with 'open' and 'navigate'."
  },
  instruction: {
    type: "string",
    description: "Natural language instruction. Used with 'act', 'extract', 'observe'. Examples: 'click the search button', 'extract all product prices', 'find the login form'."
  },
  schema: {
    type: "object",
    description: "JSON schema for structured extraction. Used with 'extract'. Optional."
  },
  variables: {
    type: "object",
    description: "Variables for sensitive data in 'act' instructions. Use %varName% in instruction. Example: instruction='type %password% in the password field', variables={password: 'secret123'}"
  }
}
```

### Example Flow

```
LLM: browser({ action: "open", url: "https://seloger.com/bordeaux" })
  -> "Session s_abc123 opened. Page: 'SeLoger - Bordeaux' (https://seloger.com/bordeaux)"

LLM: browser({ action: "act", session: "s_abc123", instruction: "set max rent to 1100 euros and check furnished filter" })
  -> "Done: Set rent filter to 1100€, checked 'Meublé' checkbox"

LLM: browser({ action: "extract", session: "s_abc123", instruction: "extract all apartment listings with title, price, surface and link" })
  -> "[{title: 'Studio Bordeaux Centre', price: 950, surface: '32m²', url: '...'}, ...]"

LLM: browser({ action: "screenshot", session: "s_abc123" })
  -> { success: true, output: "Screenshot captured", artifacts: [{ type: "image", name: "screenshot.png", content: "base64..." }] }

LLM: browser({ action: "close", session: "s_abc123" })
  -> "Session s_abc123 closed"
```

### configCheck

```typescript
configCheck: (ctx) => {
  if (!ctx.config.tools?.browser) {
    return "Browser tool requires tools.browser config. Set provider to 'local' for Playwright or 'browserbase' for cloud.";
  }
  if (ctx.config.tools.browser.provider === "browserbase" && !ctx.config.tools.browser.browserbase?.apiKey) {
    return "Browserbase provider requires tools.browser.browserbase.apiKey";
  }
  return null;
}
```

## Skill Integration

### SkillRunner Changes

When a skill declares `tools: [browser]` in its frontmatter, the SkillRunner:

1. Creates a BrowserSession before running the skill
2. Injects `ctx.browser` with bound methods
3. Closes the session in `finally` block after execution

```typescript
// In SkillRunner.run()
let browserSessionId: string | undefined;

if (skill.meta.tools.includes("browser") && browserManager) {
  browserSessionId = await browserManager.open();
}

const ctx: SkillContext = {
  exec: ...,
  memory: ...,
  state: ...,
  browser: browserSessionId ? {
    navigate: (url) => browserManager.navigate(browserSessionId, url),
    act: (instruction, vars?) => browserManager.act(browserSessionId, instruction, vars),
    extract: (instruction, schema?) => browserManager.extract(browserSessionId, instruction, schema),
    observe: (instruction) => browserManager.observe(browserSessionId, instruction),
    screenshot: () => browserManager.screenshot(browserSessionId),
  } : undefined,
  previousRun: ...,
  config: skill.meta,
};

try {
  return await executeSkill(ctx);
} finally {
  if (browserSessionId) await browserManager.close(browserSessionId);
}
```

### Example Skill

```typescript
// skills/apartment-search/skill.ts
export default async function execute(ctx: SkillContext): Promise<{ output: string }> {
  if (!ctx.browser) throw new Error("This skill requires browser tool");

  await ctx.browser.navigate("https://seloger.com/immobilier/locations/bordeaux.htm");
  await ctx.browser.act("set the maximum rent to 1100 euros");
  await ctx.browser.act("check the furnished filter");
  await ctx.browser.act("set minimum surface to 30 square meters");
  await ctx.browser.act("click search");

  const listings = await ctx.browser.extract(
    "extract all apartment listings with title, price in euros, surface area, neighborhood and listing URL"
  );

  // Compare with previous run
  const previous = await ctx.memory.read("housing-listings.json");
  const previousIds = previous ? JSON.parse(previous).map((l: any) => l.url) : [];
  const newListings = Array.isArray(listings) ? listings.filter((l: any) => !previousIds.includes(l.url)) : [];

  // Save current state
  await ctx.memory.write("housing-listings.json", JSON.stringify(listings));

  if (newListings.length === 0) return { output: "No new listings found." };

  const report = newListings.map((l: any) =>
    `- **${l.title}** — ${l.price}€/mois, ${l.surface}\n  ${l.url}`
  ).join("\n");

  return { output: `## ${newListings.length} new listing(s)\n\n${report}` };
}
```

## Configuration

### augure.json5

```json5
{
  tools: {
    browser: {
      provider: "local",   // "local" | "browserbase"
      // Uncomment for Browserbase cloud:
      // provider: "browserbase",
      // browserbase: {
      //   apiKey: "${BROWSERBASE_API_KEY}",
      //   projectId: "${BROWSERBASE_PROJECT_ID}",
      // },
      defaults: {
        timeout: 30,
        headless: true,
        viewport: { width: 1280, height: 720 },
      },
    },
  },
}
```

### LLM for Stagehand

Stagehand uses its own LLM calls for act/extract/observe. We route these through the `coding` model config (or `default` fallback) from Augure's LLM config. This keeps cost-awareness intact — browser AI calls use the model configured for coding tasks.

## Bootstrap (in `@augure/core/src/main.ts`)

```typescript
// After tool registry setup, before agent creation
let browserManager: BrowserSessionManager | undefined;

if (config.tools?.browser) {
  const browserLlm = resolveLLMClient(config.llm, "coding", log);
  browserManager = new BrowserSessionManager({
    config: config.tools.browser,
    llm: config.llm.coding ?? config.llm.default,
    ttlMs: 120_000,
    logger: log.child("browser"),
  });
}

// Register browser tool
if (browserManager) {
  tools.register(browserTool(browserManager));
}

// Pass to skill runner
const skillRunner = new SkillRunner({ ..., browserManager });

// Cleanup on shutdown
const shutdown = async () => {
  // ... existing cleanup
  if (browserManager) await browserManager.closeAll();
};
```

## What We're NOT Building (YAGNI)

- **No multi-page/tabs** — One session = one page. Sufficient for v0.
- **No Steel provider** — Browserbase + local covers all needs. Trivial to add later.
- **No Stagehand agent()** — We use act/extract/observe primitives. Augure's own LLM orchestrates.
- **No cookie/auth persistence** — Sessions are ephemeral. Skills that need auth use `act("login...")`.
- **No streaming** — Tool returns complete results.
- **No file download** — Not in scope. Use `http` tool or `sandbox_exec` for downloads.

## Testing Strategy

### Unit Tests
- `session-manager.test.ts`: mock Stagehand, test open/close/TTL/cleanup
- `provider.test.ts`: test config → Stagehand options mapping
- `browser-tool.test.ts`: mock SessionManager, test all actions + error cases

### Integration Tests (requires Playwright)
- Real Stagehand LOCAL session against a test HTML page
- Navigate + extract + screenshot round-trip

### What to Mock
- Stagehand class (unit tests)
- BrowserSessionManager (tool tests)
- Never mock in skill tests — skills test against the mock SessionManager

## Dependencies

New dependency: `@browserbasehq/stagehand` (v3.x)
- Peer dep: `playwright` (already in sandbox Dockerfile)
- Peer dep: `zod` (already used for config validation)
