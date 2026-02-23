# Browser Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered browser automation to Augure via Stagehand, with a session-based NativeTool for the LLM and `ctx.browser` integration for skills.

**Architecture:** New `@augure/browser` package wraps Stagehand with a `BrowserSessionManager` (session open/close/TTL). A `browser` NativeTool in `@augure/tools` exposes it to the LLM. The `SkillRunner` in `@augure/skills` injects `ctx.browser` for skills that declare browser dependency.

**Tech Stack:** `@browserbasehq/stagehand` v3, Playwright (peer dep), Zod (existing)

**Design doc:** `docs/plans/2026-02-23-browser-tool-design.md`

---

## Task 1: Add BrowserConfig to `@augure/types`

**Files:**
- Create: `packages/types/src/browser.ts`
- Modify: `packages/types/src/index.ts` (add export)
- Modify: `packages/types/src/config.ts:90-100` (extend ToolsConfig)
- Modify: `packages/types/src/skills.ts:65-78` (extend SkillContext)

**Step 1: Create `packages/types/src/browser.ts`**

```typescript
export interface BrowserConfig {
  provider: "local" | "browserbase";
  browserbase?: {
    apiKey: string;
    projectId?: string;
  };
  defaults?: {
    timeout?: number;
    headless?: boolean;
    viewport?: { width: number; height: number };
  };
}

export interface BrowserSessionApi {
  navigate(url: string): Promise<void>;
  act(
    instruction: string,
    variables?: Record<string, string>,
  ): Promise<{ success: boolean; message: string }>;
  extract(
    instruction: string,
    schema?: Record<string, unknown>,
  ): Promise<unknown>;
  observe(
    instruction: string,
  ): Promise<Array<{ description: string; selector: string }>>;
  screenshot(): Promise<string>;
}
```

**Step 2: Export from index**

In `packages/types/src/index.ts`, add after line 9:
```typescript
export * from "./browser.js";
```

**Step 3: Extend ToolsConfig**

In `packages/types/src/config.ts`, add to the `ToolsConfig` interface (after `github?` at line 98):
```typescript
  browser?: BrowserConfig;
```

Also add `BrowserConfig` import at top (or re-export since it's in the same package).

**Step 4: Extend SkillContext**

In `packages/types/src/skills.ts`, add `browser?` field to SkillContext (after `config: SkillMeta` at line 77):
```typescript
  browser?: BrowserSessionApi;
```

Add the import of `BrowserSessionApi` from `"./browser.js"`.

**Step 5: Build and typecheck**

Run: `pnpm --filter @augure/types build && pnpm --filter @augure/types typecheck`
Expected: PASS (no errors)

**Step 6: Commit**

```bash
git add packages/types/src/browser.ts packages/types/src/index.ts packages/types/src/config.ts packages/types/src/skills.ts
git commit -m "feat(types): add BrowserConfig and BrowserSessionApi interfaces"
```

---

## Task 2: Scaffold `@augure/browser` package

**Files:**
- Create: `packages/browser/package.json`
- Create: `packages/browser/tsconfig.json`
- Create: `packages/browser/src/index.ts`

**Step 1: Create `packages/browser/package.json`**

```json
{
  "name": "@augure/browser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "@augure/types": "workspace:*",
    "@browserbasehq/stagehand": "^3.0.0"
  },
  "devDependencies": {
    "vitest": "^4.0.18",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create `packages/browser/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/browser/src/index.ts`**

```typescript
export { BrowserSessionManager } from "./session-manager.js";
export type { BrowserSessionManagerConfig } from "./session-manager.js";
export { createStagehand } from "./provider.js";
```

**Step 4: Install dependencies**

Run: `pnpm install`
Expected: lockfile updated, `@browserbasehq/stagehand` resolved

**Step 5: Commit**

```bash
git add packages/browser/
git commit -m "feat(browser): scaffold @augure/browser package"
```

---

## Task 3: Implement Stagehand provider factory

**Files:**
- Create: `packages/browser/src/provider.ts`
- Create: `packages/browser/src/__tests__/provider.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { createStagehandConfig } from "../provider.js";

describe("createStagehandConfig", () => {
  it("should create LOCAL config for local provider", () => {
    const config = createStagehandConfig(
      { provider: "local", defaults: { headless: true, timeout: 30 } },
      { provider: "openrouter", apiKey: "sk-test", model: "anthropic/claude-sonnet-4-5", maxTokens: 4096 },
    );

    expect(config.env).toBe("LOCAL");
    expect(config.localBrowserLaunchOptions?.headless).toBe(true);
    expect(config.model).toEqual({
      modelName: "anthropic/claude-sonnet-4-5",
      apiKey: "sk-test",
    });
  });

  it("should create BROWSERBASE config for browserbase provider", () => {
    const config = createStagehandConfig(
      {
        provider: "browserbase",
        browserbase: { apiKey: "bb-key", projectId: "proj-123" },
      },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.env).toBe("BROWSERBASE");
    expect(config.apiKey).toBe("bb-key");
    expect(config.projectId).toBe("proj-123");
  });

  it("should set viewport defaults when not specified", () => {
    const config = createStagehandConfig(
      { provider: "local" },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.localBrowserLaunchOptions?.viewport).toEqual({ width: 1280, height: 720 });
  });

  it("should resolve OpenRouter base URL", () => {
    const config = createStagehandConfig(
      { provider: "local" },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.model).toHaveProperty("baseURL", "https://openrouter.ai/api/v1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/browser && npx vitest run src/__tests__/provider.test.ts`
Expected: FAIL — `createStagehandConfig` not found

**Step 3: Implement provider**

```typescript
import type { BrowserConfig, LLMModelConfig } from "@augure/types";

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
};

export interface StagehandConfig {
  env: "LOCAL" | "BROWSERBASE";
  apiKey?: string;
  projectId?: string;
  model: { modelName: string; apiKey: string; baseURL?: string };
  localBrowserLaunchOptions?: {
    headless: boolean;
    viewport: { width: number; height: number };
  };
  domSettleTimeout: number;
  verbose: 0;
}

export function createStagehandConfig(
  config: BrowserConfig,
  llm: LLMModelConfig,
): StagehandConfig {
  const baseURL = PROVIDER_BASE_URLS[llm.provider];

  return {
    env: config.provider === "local" ? "LOCAL" : "BROWSERBASE",
    apiKey: config.browserbase?.apiKey,
    projectId: config.browserbase?.projectId,
    model: {
      modelName: llm.model,
      apiKey: llm.apiKey,
      ...(baseURL ? { baseURL } : {}),
    },
    localBrowserLaunchOptions: config.provider === "local"
      ? {
          headless: config.defaults?.headless ?? true,
          viewport: config.defaults?.viewport ?? { width: 1280, height: 720 },
        }
      : undefined,
    domSettleTimeout: (config.defaults?.timeout ?? 30) * 1000,
    verbose: 0,
  };
}
```

**Step 4: Run tests**

Run: `cd packages/browser && npx vitest run src/__tests__/provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/browser/src/provider.ts packages/browser/src/__tests__/provider.test.ts
git commit -m "feat(browser): implement Stagehand provider factory"
```

---

## Task 4: Implement BrowserSessionManager

**Files:**
- Create: `packages/browser/src/session-manager.ts`
- Create: `packages/browser/src/__tests__/session-manager.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserSessionManager } from "../session-manager.js";
import type { BrowserConfig, LLMModelConfig } from "@augure/types";

// Mock Stagehand
const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  url: vi.fn().mockReturnValue("https://example.com"),
  title: vi.fn().mockResolvedValue("Example"),
};

const mockStagehand = {
  init: vi.fn().mockResolvedValue(undefined),
  act: vi.fn().mockResolvedValue({ success: true, message: "Done", actionDescription: "Clicked" }),
  extract: vi.fn().mockResolvedValue({ title: "Test" }),
  observe: vi.fn().mockResolvedValue([{ description: "Button", selector: "//button" }]),
  page: mockPage,
  context: { pages: () => [mockPage] },
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@browserbasehq/stagehand", () => ({
  Stagehand: vi.fn().mockImplementation(() => mockStagehand),
}));

const browserConfig: BrowserConfig = { provider: "local" };
const llmConfig: LLMModelConfig = {
  provider: "openrouter",
  apiKey: "sk-test",
  model: "test/model",
  maxTokens: 4096,
};

describe("BrowserSessionManager", () => {
  let manager: BrowserSessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new BrowserSessionManager({
      config: browserConfig,
      llm: llmConfig,
      ttlMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.closeAll();
  });

  it("should open a session and return a sessionId", async () => {
    const sessionId = await manager.open();
    expect(sessionId).toMatch(/^s_/);
    expect(mockStagehand.init).toHaveBeenCalled();
  });

  it("should open with URL and navigate", async () => {
    const sessionId = await manager.open("https://example.com");
    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", expect.any(Object));
  });

  it("should execute act on session", async () => {
    const sessionId = await manager.open();
    const result = await manager.act(sessionId, "click the button");
    expect(mockStagehand.act).toHaveBeenCalledWith({
      action: "click the button",
    });
    expect(result.success).toBe(true);
  });

  it("should execute extract on session", async () => {
    const sessionId = await manager.open();
    const result = await manager.extract(sessionId, "get the title");
    expect(mockStagehand.extract).toHaveBeenCalledWith({
      instruction: "get the title",
    });
  });

  it("should execute observe on session", async () => {
    const sessionId = await manager.open();
    const result = await manager.observe(sessionId, "find buttons");
    expect(mockStagehand.observe).toHaveBeenCalledWith({
      instruction: "find buttons",
    });
    expect(result).toHaveLength(1);
  });

  it("should throw on unknown session", async () => {
    await expect(manager.act("invalid", "click")).rejects.toThrow("no browser session");
  });

  it("should close session", async () => {
    const sessionId = await manager.open();
    await manager.close(sessionId);
    expect(mockStagehand.close).toHaveBeenCalled();
    await expect(manager.act(sessionId, "click")).rejects.toThrow("no browser session");
  });

  it("should close all sessions on closeAll", async () => {
    await manager.open();
    await manager.open();
    await manager.closeAll();
    expect(mockStagehand.close).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/browser && npx vitest run src/__tests__/session-manager.test.ts`
Expected: FAIL — `BrowserSessionManager` not found

**Step 3: Implement BrowserSessionManager**

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import type { BrowserConfig, LLMModelConfig, Logger } from "@augure/types";
import { noopLogger } from "@augure/types";
import { createStagehandConfig } from "./provider.js";

interface SessionEntry {
  stagehand: Stagehand;
  timer: ReturnType<typeof setTimeout>;
}

export interface BrowserSessionManagerConfig {
  config: BrowserConfig;
  llm: LLMModelConfig;
  ttlMs?: number;
  logger?: Logger;
}

let counter = 0;

export class BrowserSessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly config: BrowserConfig;
  private readonly llm: LLMModelConfig;
  private readonly ttlMs: number;
  private readonly log: Logger;

  constructor(opts: BrowserSessionManagerConfig) {
    this.config = opts.config;
    this.llm = opts.llm;
    this.ttlMs = opts.ttlMs ?? 120_000;
    this.log = opts.logger ?? noopLogger;
  }

  async open(url?: string): Promise<string> {
    const id = `s_${Date.now()}_${++counter}`;
    const stagehandConfig = createStagehandConfig(this.config, this.llm);
    const stagehand = new Stagehand(stagehandConfig as ConstructorParameters<typeof Stagehand>[0]);
    await stagehand.init();

    if (url) {
      await stagehand.page.goto(url, { waitUntil: "domcontentloaded" });
    }

    const timer = setTimeout(() => {
      this.log.warn(`Browser session ${id} expired (TTL ${this.ttlMs}ms)`);
      this.close(id).catch(() => {});
    }, this.ttlMs);

    this.sessions.set(id, { stagehand, timer });
    this.log.info(`Browser session ${id} opened`);
    return id;
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    await entry.stagehand.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async act(
    sessionId: string,
    instruction: string,
    variables?: Record<string, string>,
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    const result = await entry.stagehand.act({
      action: instruction,
      ...(variables ? { variables } : {}),
    });
    return { success: result.success, message: result.message ?? result.actionDescription ?? "" };
  }

  async extract(
    sessionId: string,
    instruction: string,
    schema?: Record<string, unknown>,
  ): Promise<unknown> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    return entry.stagehand.extract({
      instruction,
      ...(schema ? { schema } : {}),
    });
  }

  async observe(
    sessionId: string,
    instruction: string,
  ): Promise<Array<{ description: string; selector: string }>> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    const actions = await entry.stagehand.observe({ instruction });
    return actions.map((a) => ({
      description: a.description ?? "",
      selector: a.selector ?? "",
    }));
  }

  async screenshot(sessionId: string): Promise<string> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    const buffer = await entry.stagehand.page.screenshot();
    return Buffer.from(buffer).toString("base64");
  }

  async close(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.sessions.delete(sessionId);
    try {
      await entry.stagehand.close();
    } catch {
      // ignore close errors
    }
    this.log.info(`Browser session ${sessionId} closed`);
  }

  async closeAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  private getSession(sessionId: string): SessionEntry {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Unknown or expired: no browser session ${sessionId}`);
    return entry;
  }

  private resetTtl(sessionId: string, entry: SessionEntry): void {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      this.log.warn(`Browser session ${sessionId} expired (TTL ${this.ttlMs}ms)`);
      this.close(sessionId).catch(() => {});
    }, this.ttlMs);
  }
}
```

**Step 4: Run tests**

Run: `cd packages/browser && npx vitest run src/__tests__/session-manager.test.ts`
Expected: PASS

**Step 5: Verify package builds**

Run: `pnpm --filter @augure/browser build`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/browser/src/session-manager.ts packages/browser/src/__tests__/session-manager.test.ts packages/browser/src/index.ts
git commit -m "feat(browser): implement BrowserSessionManager with TTL"
```

---

## Task 5: Create the `browser` NativeTool

**Files:**
- Create: `packages/tools/src/browser.ts`
- Create: `packages/tools/src/__tests__/browser-tool.test.ts`
- Modify: `packages/tools/src/index.ts` (add export)
- Modify: `packages/tools/package.json` (add `@augure/browser` dep)

**Step 1: Add dependency**

In `packages/tools/package.json`, add to dependencies:
```json
"@augure/browser": "workspace:*"
```

Run: `pnpm install`

**Step 2: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBrowserTool } from "../browser.js";
import type { ToolContext, AppConfig } from "@augure/types";

const mockManager = {
  open: vi.fn().mockResolvedValue("s_test_1"),
  navigate: vi.fn().mockResolvedValue(undefined),
  act: vi.fn().mockResolvedValue({ success: true, message: "Clicked button" }),
  extract: vi.fn().mockResolvedValue([{ title: "Apt 1", price: 900 }]),
  observe: vi.fn().mockResolvedValue([{ description: "Search button", selector: "//button" }]),
  screenshot: vi.fn().mockResolvedValue("iVBORw0KGgo="),
  close: vi.fn().mockResolvedValue(undefined),
  closeAll: vi.fn().mockResolvedValue(undefined),
};

const ctx = {
  config: { tools: { browser: { provider: "local" } } } as unknown as AppConfig,
} as unknown as ToolContext;

describe("browser tool", () => {
  let tool: ReturnType<typeof createBrowserTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createBrowserTool(mockManager as never);
  });

  it("should have name 'browser'", () => {
    expect(tool.name).toBe("browser");
  });

  it("should open a session", async () => {
    const result = await tool.execute({ action: "open", url: "https://example.com" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("s_test_1");
    expect(mockManager.open).toHaveBeenCalledWith("https://example.com");
  });

  it("should act on a session", async () => {
    const result = await tool.execute({
      action: "act",
      session: "s_test_1",
      instruction: "click the button",
    }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Clicked button");
  });

  it("should extract from a session", async () => {
    const result = await tool.execute({
      action: "extract",
      session: "s_test_1",
      instruction: "get all listings",
    }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Apt 1");
  });

  it("should observe elements", async () => {
    const result = await tool.execute({
      action: "observe",
      session: "s_test_1",
      instruction: "find buttons",
    }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Search button");
  });

  it("should take a screenshot", async () => {
    const result = await tool.execute({ action: "screenshot", session: "s_test_1" }, ctx);
    expect(result.success).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts![0].type).toBe("image");
  });

  it("should close a session", async () => {
    const result = await tool.execute({ action: "close", session: "s_test_1" }, ctx);
    expect(result.success).toBe(true);
    expect(mockManager.close).toHaveBeenCalledWith("s_test_1");
  });

  it("should require session for non-open actions", async () => {
    const result = await tool.execute({ action: "act", instruction: "click" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("session");
  });

  it("should require instruction for act/extract/observe", async () => {
    const result = await tool.execute({ action: "act", session: "s_1" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("instruction");
  });

  it("should return configCheck warning when browser not configured", () => {
    const noConfig = { config: { tools: {} } } as unknown as ToolContext;
    expect(tool.configCheck!(noConfig)).toContain("browser");
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/tools && npx vitest run src/__tests__/browser-tool.test.ts`
Expected: FAIL

**Step 4: Implement the browser tool**

```typescript
import type { NativeTool, ToolContext, ToolResult } from "@augure/types";
import type { BrowserSessionManager } from "@augure/browser";

type Action = "open" | "navigate" | "act" | "extract" | "observe" | "screenshot" | "close";

interface BrowserParams {
  action: Action;
  session?: string;
  url?: string;
  instruction?: string;
  schema?: Record<string, unknown>;
  variables?: Record<string, string>;
}

export function createBrowserTool(manager: BrowserSessionManager): NativeTool {
  return {
    name: "browser",
    description:
      "AI-powered browser automation. Open a session, then use natural language to interact with web pages. " +
      "Actions: open (creates session), navigate, act (click/type/interact), extract (get structured data), " +
      "observe (discover elements), screenshot, close. " +
      "Use 'act' with natural language instructions instead of CSS selectors. " +
      "Use 'extract' with an instruction describing what data to get. " +
      "Always close sessions when done.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open", "navigate", "act", "extract", "observe", "screenshot", "close"],
          description: "The browser action to perform",
        },
        session: {
          type: "string",
          description: "Session ID from 'open'. Required for all actions except 'open'.",
        },
        url: {
          type: "string",
          description: "URL to navigate to. Used with 'open' and 'navigate'.",
        },
        instruction: {
          type: "string",
          description:
            "Natural language instruction for act/extract/observe. " +
            "Examples: 'click the search button', 'extract all product prices and titles', 'find the login form'.",
        },
        schema: {
          type: "object",
          description: "JSON schema for structured extraction with 'extract'. Optional.",
        },
        variables: {
          type: "object",
          description:
            "Variables for sensitive data in 'act'. Use %varName% in instruction. " +
            "Example: instruction='type %password%', variables={password: 'secret'}",
        },
      },
      required: ["action"],
    },

    configCheck: (ctx: ToolContext) => {
      if (!ctx.config.tools?.browser) {
        return "Browser tool requires tools.browser config in augure.json5. Set provider to 'local' for Playwright or 'browserbase' for cloud.";
      }
      if (
        ctx.config.tools.browser.provider === "browserbase" &&
        !ctx.config.tools.browser.browserbase?.apiKey
      ) {
        return "Browserbase provider requires tools.browser.browserbase.apiKey";
      }
      return null;
    },

    execute: async (params: unknown, _ctx: ToolContext): Promise<ToolResult> => {
      const p = params as BrowserParams;

      if (p.action !== "open" && !p.session) {
        return { success: false, output: "Missing 'session' — open a session first with action: 'open'" };
      }

      if (["act", "extract", "observe"].includes(p.action) && !p.instruction) {
        return { success: false, output: `Missing 'instruction' for action '${p.action}'` };
      }

      try {
        switch (p.action) {
          case "open": {
            const sessionId = await manager.open(p.url);
            return { success: true, output: `Session ${sessionId} opened.${p.url ? ` Navigated to ${p.url}` : ""}` };
          }

          case "navigate": {
            if (!p.url) return { success: false, output: "Missing 'url' for navigate" };
            await manager.navigate(p.session!, p.url);
            return { success: true, output: `Navigated to ${p.url}` };
          }

          case "act": {
            const result = await manager.act(p.session!, p.instruction!, p.variables);
            return { success: result.success, output: result.message || "Action completed" };
          }

          case "extract": {
            const data = await manager.extract(p.session!, p.instruction!, p.schema);
            const output = typeof data === "string" ? data : JSON.stringify(data, null, 2);
            return { success: true, output };
          }

          case "observe": {
            const elements = await manager.observe(p.session!, p.instruction!);
            return {
              success: true,
              output: elements.length > 0
                ? elements.map((e) => `- ${e.description} (${e.selector})`).join("\n")
                : "No matching elements found",
            };
          }

          case "screenshot": {
            const base64 = await manager.screenshot(p.session!);
            return {
              success: true,
              output: "Screenshot captured",
              artifacts: [{ type: "image", name: "screenshot.png", content: base64 }],
            };
          }

          case "close": {
            await manager.close(p.session!);
            return { success: true, output: `Session ${p.session} closed` };
          }

          default:
            return { success: false, output: `Unknown action: ${p.action}` };
        }
      } catch (err) {
        return {
          success: false,
          output: `Browser error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
```

**Step 5: Export from index**

In `packages/tools/src/index.ts`, add after line 11:
```typescript
export { createBrowserTool } from "./browser.js";
```

**Step 6: Run tests**

Run: `cd packages/tools && npx vitest run src/__tests__/browser-tool.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/tools/src/browser.ts packages/tools/src/__tests__/browser-tool.test.ts packages/tools/src/index.ts packages/tools/package.json
git commit -m "feat(tools): add session-based browser NativeTool"
```

---

## Task 6: Wire browser into core bootstrap

**Files:**
- Modify: `packages/core/src/main.ts` (~lines 130-140 for registration, ~lines 509-519 for shutdown)
- Modify: `packages/core/package.json` (add `@augure/browser` dep)
- Modify: `packages/core/src/config.ts:74-116` (add browser Zod schema)

**Step 1: Add dependency to core**

In `packages/core/package.json`, add:
```json
"@augure/browser": "workspace:*"
```

Run: `pnpm install`

**Step 2: Add browser Zod schema to config validation**

In `packages/core/src/config.ts`, inside the `tools` object (after `github` at line 115), add:

```typescript
    browser: z
      .object({
        provider: z.enum(["local", "browserbase"]),
        browserbase: z
          .object({
            apiKey: z.string().min(1),
            projectId: z.string().optional(),
          })
          .optional(),
        defaults: z
          .object({
            timeout: z.number().int().positive().optional(),
            headless: z.boolean().optional(),
            viewport: z
              .object({
                width: z.number().int().positive(),
                height: z.number().int().positive(),
              })
              .optional(),
          })
          .optional(),
      })
      .optional(),
```

**Step 3: Add browser initialization and registration in `main.ts`**

After the existing tool registration block (~line 140), add:

```typescript
// Browser tool
import { BrowserSessionManager } from "@augure/browser";
import { createBrowserTool } from "@augure/tools";

let browserManager: BrowserSessionManager | undefined;

if (config.tools?.browser) {
  const browserLlm = config.llm.coding ?? config.llm.default;
  browserManager = new BrowserSessionManager({
    config: config.tools.browser,
    llm: browserLlm,
    ttlMs: 120_000,
    logger: log.child("browser"),
  });
  tools.register(createBrowserTool(browserManager));
  log.info("Browser tool registered", { provider: config.tools.browser.provider });
}
```

**Step 4: Add browser cleanup to shutdown handler**

In the `shutdown` function (~line 509-519), add before `await pool.destroyAll()`:

```typescript
if (browserManager) await browserManager.closeAll();
```

**Step 5: Pass browserManager to SkillRunner**

Where `SkillRunner` is constructed (~line 190), update:

```typescript
const skillRunner = new SkillRunner({ pool, manager: skillManager, defaults, browserManager });
```

(This will be wired in Task 7.)

**Step 6: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS (may need Task 7 first for SkillRunner type change)

**Step 7: Commit**

```bash
git add packages/core/src/main.ts packages/core/src/config.ts packages/core/package.json
git commit -m "feat(core): wire browser tool into bootstrap and shutdown"
```

---

## Task 7: Inject `ctx.browser` into SkillRunner

**Files:**
- Modify: `packages/skills/src/runner.ts` (add browserManager to config, inject into harness)
- Modify: `packages/skills/src/__tests__/runner.test.ts` (add browser tests)
- Modify: `packages/skills/package.json` (add `@augure/browser` dep)

**Step 1: Add dependency**

In `packages/skills/package.json`, add:
```json
"@augure/browser": "workspace:*"
```

Run: `pnpm install`

**Step 2: Write the failing test**

Add to the existing runner test file (`packages/skills/src/__tests__/runner.test.ts`) a new describe block:

```typescript
describe("SkillRunner with browser", () => {
  it("should inject browser into skill context when browserManager provided", async () => {
    // This test verifies the harness template includes browser APIs
    // when browserManager is provided and skill declares tools: [browser]
    const mockBrowserManager = {
      open: vi.fn().mockResolvedValue("s_test"),
      navigate: vi.fn().mockResolvedValue(undefined),
      act: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
      extract: vi.fn().mockResolvedValue({ data: "test" }),
      observe: vi.fn().mockResolvedValue([]),
      screenshot: vi.fn().mockResolvedValue("base64"),
      close: vi.fn().mockResolvedValue(undefined),
      closeAll: vi.fn().mockResolvedValue(undefined),
    };

    const runner = new SkillRunner({
      pool: mockPool,
      manager: mockManager,
      defaults: { timeout: 30, memoryLimit: "256m", cpuLimit: "0.5" },
      browserManager: mockBrowserManager as never,
    });

    // runner should accept browserManager in config without error
    expect(runner).toBeDefined();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/skills && npx vitest run src/__tests__/runner.test.ts`
Expected: FAIL — SkillRunnerConfig doesn't accept `browserManager`

**Step 4: Update SkillRunnerConfig and run method**

In `packages/skills/src/runner.ts`:

1. Add to `SkillRunnerConfig` interface (~line 8):
```typescript
export interface SkillRunnerConfig {
  pool: ContainerPool;
  manager: SkillManager;
  defaults: {
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
  browserManager?: {
    open(url?: string): Promise<string>;
    navigate(sessionId: string, url: string): Promise<void>;
    act(sessionId: string, instruction: string, variables?: Record<string, string>): Promise<{ success: boolean; message: string }>;
    extract(sessionId: string, instruction: string, schema?: Record<string, unknown>): Promise<unknown>;
    observe(sessionId: string, instruction: string): Promise<Array<{ description: string; selector: string }>>;
    screenshot(sessionId: string): Promise<string>;
    close(sessionId: string): Promise<void>;
  };
}
```

2. In the `run()` method, after acquiring the container and before executing the harness (~line 130):

```typescript
// Open browser session if skill uses browser
let browserSessionId: string | undefined;
if (skill.meta.tools.includes("browser") && this.config.browserManager) {
  try {
    browserSessionId = await this.config.browserManager.open();
  } catch (err) {
    // Non-fatal: skill can still run without browser
  }
}
```

3. In the injected config JSON, add browser session info:
```typescript
const configData = JSON.stringify({
  previousRun,
  config: skill.meta,
  browserSessionId,
});
```

4. In the harness template, add browser context if session is available. Add after `config: __injected.config,` (~line 78):
```typescript
  browser: __injected.browserSessionId ? {
    // Browser calls go through HTTP bridge to host process
    // For now, browser is available via the tool registry in the host
    // Skills using browser should call ctx.exec() with browser commands
  } : undefined,
```

Note: Since skills run inside containers but Stagehand runs in the host process, the browser API needs a bridge. The simpler approach for v0: **skills that need browser should be run host-side, not in containers**. Update the `run()` method to detect browser skills and execute them differently.

**Alternative (simpler for v0):** Don't inject `ctx.browser` inside containers. Instead, browser-enabled skills run their browser calls through the NativeTool (the LLM orchestrates). Mark this as a v1 enhancement — for now, `ctx.browser` only works when skills are run in-process (not in containers).

**Step 5: In the `finally` block, close browser session**

After `await this.config.pool.release(container)`:
```typescript
if (browserSessionId && this.config.browserManager) {
  await this.config.browserManager.close(browserSessionId).catch(() => {});
}
```

**Step 6: Run tests**

Run: `cd packages/skills && npx vitest run src/__tests__/runner.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/skills/src/runner.ts packages/skills/src/__tests__/runner.test.ts packages/skills/package.json
git commit -m "feat(skills): add browserManager to SkillRunnerConfig"
```

---

## Task 8: Full build, lint, typecheck

**Files:** None (validation only)

**Step 1: Build all packages in order**

Run: `pnpm build`
Expected: PASS — all packages build including new `@augure/browser`

**Step 2: Lint**

Run: `pnpm lint`
Expected: PASS

**Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Run all tests**

Run: `pnpm test:unit`
Expected: PASS — all existing tests still pass + new browser tests pass

**Step 5: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: resolve build/lint/type issues from browser tool integration"
```

---

## Task 9: Add changeset

**Step 1: Create changeset**

Run: `pnpm changeset`

Select packages: `@augure/types`, `@augure/browser` (new), `@augure/tools`, `@augure/core`, `@augure/skills`

Type: minor for `@augure/types`, `@augure/tools`, `@augure/core`; patch for `@augure/skills`; initial for `@augure/browser`

Summary:
```
Add browser automation via Stagehand. New @augure/browser package with BrowserSessionManager.
Session-based browser NativeTool for LLM with act/extract/observe/screenshot actions.
Supports local Playwright and Browserbase cloud providers.
```

**Step 2: Commit changeset**

```bash
git add .changeset/ && git commit -m "chore: add changeset for browser tool"
```

---

## Notes for Implementer

### Key things to watch for:
1. **Stagehand types** may not align perfectly with our interface. Check the actual Stagehand v3 exports and adapt `session-manager.ts` accordingly.
2. **The `model` config** in Stagehand accepts various formats. Test with actual OpenRouter API key to verify the `baseURL` + `apiKey` combo works.
3. **Skills + browser bridge**: v0 the LLM orchestrates browser calls for skills via the NativeTool. Direct `ctx.browser` inside container-executed skills requires an HTTP bridge (v1).
4. **Local provider** needs Playwright + Chromium installed. The sandbox Dockerfile already has it, but the host machine may not for local (non-container) execution.

### Files touched summary:
- **Created**: `packages/browser/` (new package, 4 source files + 2 test files)
- **Created**: `packages/types/src/browser.ts`
- **Created**: `packages/tools/src/browser.ts` + test
- **Modified**: `packages/types/src/{index,config,skills}.ts`
- **Modified**: `packages/tools/src/index.ts` + `package.json`
- **Modified**: `packages/core/src/{main,config}.ts` + `package.json`
- **Modified**: `packages/skills/src/runner.ts` + test + `package.json`
