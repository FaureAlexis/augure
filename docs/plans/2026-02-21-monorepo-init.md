# Augure Monorepo Initialization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the complete Augure monorepo with all 7 packages, build toolchain, shared config, Docker setup, and a minimal working agent loop that receives a Telegram message, calls an LLM, and responds.

**Architecture:** pnpm workspaces monorepo with Turborepo. 7 packages under `packages/` (`core`, `memory`, `scheduler`, `skills`, `sandbox`, `channels`, `tools`). Shared TypeScript config, ESLint, Vitest. Each package exports via `src/index.ts`. The agent entrypoint lives in `packages/core/src/agent.ts`. Config is JSON5 with env var interpolation.

**Tech Stack:** Node 22, TypeScript 5.7+, pnpm 10, Turborepo, Vitest, ESLint 9 (flat config), grammy (Telegram), dockerode, node-cron, JSON5, msw (test mocks), zod (config validation).

---

## Task 1: Root monorepo scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.env.example`

**Step 1: Create root `package.json`**

```json
{
  "name": "augure",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "packageManager": "pnpm@10.15.1",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean"
  }
}
```

**Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

**Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "test:unit": {},
    "test:integration": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Step 4: Create `.gitignore`**

```
node_modules/
dist/
.turbo/
*.tsbuildinfo
.env
.env.local
logs/
!logs/.gitkeep
skills/*/runs/
coverage/
.DS_Store
```

**Step 5: Create `.nvmrc`**

```
22
```

**Step 6: Create `.env.example`**

```bash
# LLM Provider
OPENROUTER_API_KEY=sk-or-...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# Search (optional)
TAVILY_API_KEY=tvly-...

# Email (optional)
EMAIL_USER=
EMAIL_PASSWORD=

# GitHub (optional)
GITHUB_TOKEN=ghp_...
```

**Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .nvmrc .env.example
git commit -m "chore: init monorepo scaffolding"
```

---

## Task 2: Shared TypeScript & tooling config

**Files:**
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `vitest.workspace.ts`

**Step 1: Install root dev dependencies**

```bash
pnpm add -Dw typescript @types/node eslint @eslint/js typescript-eslint vitest turbo
```

**Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

**Step 3: Create `eslint.config.js`**

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js"],
  }
);
```

**Step 4: Create `vitest.workspace.ts`**

```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["packages/*"]);
```

**Step 5: Commit**

```bash
git add tsconfig.base.json eslint.config.js vitest.workspace.ts package.json pnpm-lock.yaml
git commit -m "chore: add shared typescript, eslint, vitest config"
```

---

## Task 3: Package `@augure/types` — shared types & interfaces

This package holds all shared interfaces so other packages can import them without circular deps.

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/vitest.config.ts`
- Create: `packages/types/src/index.ts`
- Create: `packages/types/src/llm.ts`
- Create: `packages/types/src/tools.ts`
- Create: `packages/types/src/config.ts`
- Create: `packages/types/src/channels.ts`
- Create: `packages/types/src/memory.ts`
- Create: `packages/types/src/skills.ts`
- Create: `packages/types/src/scheduler.ts`

**Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@augure/types",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

Note: This is a types-only package — no build step, no dist. Other packages import directly from source via TypeScript project references.

**Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/types/src/llm.ts`**

```ts
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMClient {
  chat(messages: Message[]): Promise<LLMResponse>;
}
```

**Step 4: Create `packages/types/src/tools.ts`**

```ts
export interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: Artifact[];
}

export interface Artifact {
  type: "file" | "image" | "json";
  name: string;
  content: string;
}

export interface NativeTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  config: AppConfig;
}

// Forward reference — full type will grow as packages are built
export interface AppConfig {
  identity: IdentityConfig;
  llm: LLMConfig;
  channels: ChannelsConfig;
  memory: MemoryConfig;
  scheduler: SchedulerConfig;
  sandbox: SandboxConfig;
  tools: ToolsConfig;
  security: SecurityConfig;
}
```

**Step 5: Create `packages/types/src/config.ts`**

```ts
export interface IdentityConfig {
  name: string;
  personality: string;
}

export interface LLMModelConfig {
  provider: "openrouter" | "anthropic" | "openai";
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface LLMConfig {
  default: LLMModelConfig;
  reasoning?: Partial<LLMModelConfig>;
  ingestion?: Partial<LLMModelConfig>;
  monitoring?: Partial<LLMModelConfig>;
  coding?: Partial<LLMModelConfig>;
}

export interface ChannelsConfig {
  telegram?: {
    enabled: boolean;
    botToken: string;
    allowedUsers: number[];
  };
  whatsapp?: {
    enabled: boolean;
  };
  web?: {
    enabled: boolean;
    port: number;
  };
}

export interface MemoryConfig {
  path: string;
  autoIngest: boolean;
  maxRetrievalTokens: number;
}

export interface SchedulerJobConfig {
  id: string;
  cron: string;
  prompt: string;
  channel: string;
}

export interface SchedulerConfig {
  heartbeatInterval: string;
  jobs: SchedulerJobConfig[];
}

export interface SandboxConfig {
  runtime: "docker";
  defaults: {
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
}

export interface ToolsConfig {
  webSearch?: {
    provider: "tavily" | "searxng";
    apiKey: string;
  };
  email?: {
    imap: { host: string; port: number; user: string; password: string };
    smtp: { host: string; port: number; user: string; password: string };
  };
  github?: {
    token: string;
  };
}

export interface SecurityConfig {
  sandboxOnly: boolean;
  allowedHosts: string[];
  maxConcurrentSandboxes: number;
}
```

**Step 6: Create `packages/types/src/channels.ts`**

```ts
export interface IncomingMessage {
  id: string;
  channelType: "telegram" | "whatsapp" | "web";
  userId: string;
  text: string;
  timestamp: Date;
  replyTo?: string;
}

export interface OutgoingMessage {
  channelType: "telegram" | "whatsapp" | "web";
  userId: string;
  text: string;
  replyTo?: string;
}

export interface Channel {
  type: "telegram" | "whatsapp" | "web";
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutgoingMessage): Promise<void>;
  onMessage(handler: (message: IncomingMessage) => Promise<void>): void;
}
```

**Step 7: Create `packages/types/src/memory.ts`**

```ts
export interface MemoryStore {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  list(directory?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}
```

**Step 8: Create `packages/types/src/skills.ts`**

```ts
export type SkillStatus = "draft" | "testing" | "active" | "paused" | "broken";

export interface SkillMeta {
  id: string;
  name: string;
  version: number;
  created: string;
  updated: string;
  status: SkillStatus;
  trigger: {
    type: "cron" | "manual" | "event";
    schedule?: string;
    channel?: string;
  };
  sandbox: boolean;
  tools: string[];
  tags: string[];
}

export interface SkillRunResult {
  skillId: string;
  timestamp: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  tokens?: { input: number; output: number; cost: number };
}
```

**Step 9: Create `packages/types/src/scheduler.ts`**

```ts
export interface Job {
  id: string;
  cron: string;
  prompt: string;
  channel: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  addJob(job: Job): void;
  removeJob(id: string): void;
  listJobs(): Job[];
  triggerJob(id: string): Promise<void>;
}
```

**Step 10: Create `packages/types/src/index.ts`**

```ts
export * from "./llm.js";
export * from "./tools.js";
export * from "./config.js";
export * from "./channels.js";
export * from "./memory.js";
export * from "./skills.js";
export * from "./scheduler.js";
```

**Step 11: Create `packages/types/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 12: Commit**

```bash
git add packages/types/
git commit -m "feat: add @augure/types package with all shared interfaces"
```

---

## Task 4: Package `@augure/memory` — filesystem memory store

**Files:**
- Create: `packages/memory/package.json`
- Create: `packages/memory/tsconfig.json`
- Create: `packages/memory/vitest.config.ts`
- Create: `packages/memory/src/index.ts`
- Create: `packages/memory/src/store.ts`
- Test: `packages/memory/src/__tests__/store.test.ts`

**Step 1: Create `packages/memory/package.json`**

```json
{
  "name": "@augure/memory",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

**Step 2: Create `packages/memory/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

**Step 3: Create `packages/memory/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 4: Write the failing test**

Create `packages/memory/src/__tests__/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileMemoryStore } from "../store.js";

describe("FileMemoryStore", () => {
  let tmpDir: string;
  let store: FileMemoryStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "augure-memory-"));
    store = new FileMemoryStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("should write and read a file", async () => {
    await store.write("test.md", "# Hello\nWorld");
    const content = await store.read("test.md");
    expect(content).toBe("# Hello\nWorld");
  });

  it("should create nested directories on write", async () => {
    await store.write("preferences/interests.md", "# Interests\n- TypeScript");
    const content = await store.read("preferences/interests.md");
    expect(content).toContain("TypeScript");
  });

  it("should append content to a file", async () => {
    await store.write("observations.md", "## 2026-02-20\n- Fact 1\n");
    await store.append("observations.md", "\n## 2026-02-21\n- Fact 2\n");
    const content = await store.read("observations.md");
    expect(content).toContain("Fact 1");
    expect(content).toContain("Fact 2");
  });

  it("should list files in a directory", async () => {
    await store.write("preferences/a.md", "a");
    await store.write("preferences/b.md", "b");
    const files = await store.list("preferences");
    expect(files.sort()).toEqual(["preferences/a.md", "preferences/b.md"]);
  });

  it("should list files recursively from root", async () => {
    await store.write("identity.md", "id");
    await store.write("preferences/interests.md", "interests");
    const files = await store.list();
    expect(files).toContain("identity.md");
    expect(files).toContain("preferences/interests.md");
  });

  it("should check if a file exists", async () => {
    expect(await store.exists("nope.md")).toBe(false);
    await store.write("yes.md", "content");
    expect(await store.exists("yes.md")).toBe(true);
  });

  it("should throw on read of non-existent file", async () => {
    await expect(store.read("missing.md")).rejects.toThrow();
  });
});
```

**Step 5: Run test to verify it fails**

```bash
cd packages/memory && pnpm test
```

Expected: FAIL — `FileMemoryStore` does not exist yet.

**Step 6: Implement `FileMemoryStore`**

Create `packages/memory/src/store.ts`:

```ts
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import type { MemoryStore } from "@augure/types";

export class FileMemoryStore implements MemoryStore {
  constructor(private readonly basePath: string) {}

  async read(path: string): Promise<string> {
    return readFile(this.resolve(path), "utf-8");
  }

  async write(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
  }

  async append(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    try {
      const existing = await readFile(full, "utf-8");
      await writeFile(full, existing + content, "utf-8");
    } catch {
      await this.write(path, content);
    }
  }

  async list(directory?: string): Promise<string[]> {
    const dir = directory ? this.resolve(directory) : this.basePath;
    return this.listRecursive(dir);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }

  private resolve(path: string): string {
    return join(this.basePath, path);
  }

  private async listRecursive(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listRecursive(full)));
      } else {
        files.push(relative(this.basePath, full));
      }
    }
    return files;
  }
}
```

**Step 7: Create `packages/memory/src/index.ts`**

```ts
export { FileMemoryStore } from "./store.js";
```

**Step 8: Run tests to verify they pass**

```bash
cd packages/memory && pnpm test
```

Expected: All 7 tests PASS.

**Step 9: Commit**

```bash
git add packages/memory/
git commit -m "feat: add @augure/memory package with FileMemoryStore"
```

---

## Task 5: Package `@augure/core` — config loader

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/config.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/config.test.ts`

**Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@augure/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

**Step 2: Install json5 + zod in core**

```bash
pnpm add --filter @augure/core json5 zod
```

**Step 3: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

**Step 4: Create `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 5: Write the failing test**

Create `packages/core/src/__tests__/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../config.js";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "augure-config-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("should load a valid JSON5 config file", async () => {
    const configContent = `{
      // Identity
      identity: { name: "Augure", personality: "Helpful" },
      llm: {
        default: {
          provider: "openrouter",
          apiKey: "sk-test",
          model: "anthropic/claude-sonnet-4-5",
          maxTokens: 8192,
        },
      },
      channels: {},
      memory: { path: "./memory", autoIngest: true, maxRetrievalTokens: 2000 },
      scheduler: { heartbeatInterval: "30m", jobs: [] },
      sandbox: { runtime: "docker", defaults: { timeout: 300, memoryLimit: "512m", cpuLimit: "1.0" } },
      tools: {},
      security: { sandboxOnly: true, allowedHosts: [], maxConcurrentSandboxes: 3 },
    }`;
    const configPath = join(tmpDir, "augure.json5");
    await writeFile(configPath, configContent);

    const config = await loadConfig(configPath);
    expect(config.identity.name).toBe("Augure");
    expect(config.llm.default.model).toBe("anthropic/claude-sonnet-4-5");
  });

  it("should interpolate environment variables", async () => {
    process.env.TEST_API_KEY = "sk-from-env";
    const configContent = `{
      identity: { name: "Augure", personality: "Helpful" },
      llm: {
        default: {
          provider: "openrouter",
          apiKey: "\${TEST_API_KEY}",
          model: "test-model",
          maxTokens: 1024,
        },
      },
      channels: {},
      memory: { path: "./memory", autoIngest: true, maxRetrievalTokens: 2000 },
      scheduler: { heartbeatInterval: "30m", jobs: [] },
      sandbox: { runtime: "docker", defaults: { timeout: 300, memoryLimit: "512m", cpuLimit: "1.0" } },
      tools: {},
      security: { sandboxOnly: true, allowedHosts: [], maxConcurrentSandboxes: 3 },
    }`;
    const configPath = join(tmpDir, "augure.json5");
    await writeFile(configPath, configContent);

    const config = await loadConfig(configPath);
    expect(config.llm.default.apiKey).toBe("sk-from-env");

    delete process.env.TEST_API_KEY;
  });

  it("should throw on missing required fields", async () => {
    const configPath = join(tmpDir, "augure.json5");
    await writeFile(configPath, `{ identity: { name: "Augure" } }`);

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should throw on missing config file", async () => {
    await expect(loadConfig("/nonexistent/augure.json5")).rejects.toThrow();
  });
});
```

**Step 6: Run test to verify it fails**

```bash
cd packages/core && pnpm test
```

Expected: FAIL — `loadConfig` does not exist yet.

**Step 7: Implement config loader**

Create `packages/core/src/config.ts`:

```ts
import { readFile } from "node:fs/promises";
import JSON5 from "json5";
import { z } from "zod";
import type { AppConfig } from "@augure/types";

const LLMModelConfigSchema = z.object({
  provider: z.enum(["openrouter", "anthropic", "openai"]),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  maxTokens: z.number().positive(),
});

const ConfigSchema = z.object({
  identity: z.object({
    name: z.string().min(1),
    personality: z.string(),
  }),
  llm: z.object({
    default: LLMModelConfigSchema,
    reasoning: LLMModelConfigSchema.partial().optional(),
    ingestion: LLMModelConfigSchema.partial().optional(),
    monitoring: LLMModelConfigSchema.partial().optional(),
    coding: LLMModelConfigSchema.partial().optional(),
  }),
  channels: z.object({
    telegram: z
      .object({
        enabled: z.boolean(),
        botToken: z.string(),
        allowedUsers: z.array(z.number()),
      })
      .optional(),
    whatsapp: z.object({ enabled: z.boolean() }).optional(),
    web: z.object({ enabled: z.boolean(), port: z.number() }).optional(),
  }),
  memory: z.object({
    path: z.string(),
    autoIngest: z.boolean(),
    maxRetrievalTokens: z.number().positive(),
  }),
  scheduler: z.object({
    heartbeatInterval: z.string(),
    jobs: z.array(
      z.object({
        id: z.string(),
        cron: z.string(),
        prompt: z.string(),
        channel: z.string(),
      })
    ),
  }),
  sandbox: z.object({
    runtime: z.literal("docker"),
    defaults: z.object({
      timeout: z.number().positive(),
      memoryLimit: z.string(),
      cpuLimit: z.string(),
    }),
  }),
  tools: z.record(z.unknown()).default({}),
  security: z.object({
    sandboxOnly: z.boolean(),
    allowedHosts: z.array(z.string()),
    maxConcurrentSandboxes: z.number().positive(),
  }),
});

function interpolateEnvVars(raw: string): string {
  return raw.replace(/\$\{(\w+)\}/g, (_match, name: string) => {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`Environment variable ${name} is not set`);
    }
    return value;
  });
}

export async function loadConfig(path: string): Promise<AppConfig> {
  const raw = await readFile(path, "utf-8");
  const interpolated = interpolateEnvVars(raw);
  const parsed = JSON5.parse(interpolated);
  return ConfigSchema.parse(parsed) as AppConfig;
}
```

**Step 8: Create `packages/core/src/index.ts`**

```ts
export { loadConfig } from "./config.js";
```

**Step 9: Run tests to verify they pass**

```bash
cd packages/core && pnpm test
```

Expected: All 4 tests PASS.

**Step 10: Commit**

```bash
git add packages/core/
git commit -m "feat: add @augure/core with JSON5 config loader and env var interpolation"
```

---

## Task 6: Package `@augure/core` — LLM client (OpenRouter)

**Files:**
- Create: `packages/core/src/llm.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/llm.test.ts`

**Step 1: Write the failing test**

Create `packages/core/src/__tests__/llm.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { OpenRouterClient } from "../llm.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("OpenRouterClient", () => {
  it("should send messages and return a response", async () => {
    server.use(
      http.post("https://openrouter.ai/api/v1/chat/completions", () => {
        return HttpResponse.json({
          choices: [{ message: { content: "Hello from LLM", tool_calls: undefined } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      })
    );

    const client = new OpenRouterClient({
      apiKey: "sk-test",
      model: "test-model",
      maxTokens: 1024,
    });

    const response = await client.chat([
      { role: "user", content: "Hello" },
    ]);

    expect(response.content).toBe("Hello from LLM");
    expect(response.toolCalls).toEqual([]);
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
  });

  it("should parse tool calls from response", async () => {
    server.use(
      http.post("https://openrouter.ai/api/v1/chat/completions", () => {
        return HttpResponse.json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "web_search",
                      arguments: '{"query":"test"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 10 },
        });
      })
    );

    const client = new OpenRouterClient({
      apiKey: "sk-test",
      model: "test-model",
      maxTokens: 1024,
    });

    const response = await client.chat([
      { role: "user", content: "Search for test" },
    ]);

    expect(response.content).toBe("");
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].name).toBe("web_search");
    expect(response.toolCalls[0].arguments).toEqual({ query: "test" });
  });

  it("should throw on API error", async () => {
    server.use(
      http.post("https://openrouter.ai/api/v1/chat/completions", () => {
        return HttpResponse.json(
          { error: { message: "Invalid API key" } },
          { status: 401 }
        );
      })
    );

    const client = new OpenRouterClient({
      apiKey: "bad-key",
      model: "test-model",
      maxTokens: 1024,
    });

    await expect(
      client.chat([{ role: "user", content: "Hello" }])
    ).rejects.toThrow("Invalid API key");
  });
});
```

**Step 2: Install msw in root dev deps**

```bash
pnpm add -Dw msw
```

**Step 3: Run test to verify it fails**

```bash
cd packages/core && pnpm test
```

Expected: FAIL — `OpenRouterClient` does not exist.

**Step 4: Implement LLM client**

Create `packages/core/src/llm.ts`:

```ts
import type { Message, LLMResponse, LLMClient, ToolCall } from "@augure/types";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl?: string;
}

interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

interface OpenRouterError {
  error: { message: string };
}

export class OpenRouterClient implements LLMClient {
  private readonly config: Required<OpenRouterConfig>;

  constructor(config: OpenRouterConfig) {
    this.config = {
      baseUrl: "https://openrouter.ai/api/v1",
      ...config,
    };
  }

  async chat(messages: Message[]): Promise<LLMResponse> {
    const response = await fetch(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          })),
        }),
      }
    );

    if (!response.ok) {
      const err = (await response.json()) as OpenRouterError;
      throw new Error(err.error?.message ?? `API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const choice = data.choices[0];

    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(
      (tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })
    );

    return {
      content: choice.message.content ?? "",
      toolCalls,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}
```

**Step 5: Update `packages/core/src/index.ts`**

```ts
export { loadConfig } from "./config.js";
export { OpenRouterClient } from "./llm.js";
export type { OpenRouterConfig } from "./llm.js";
```

**Step 6: Run tests to verify they pass**

```bash
cd packages/core && pnpm test
```

Expected: All 7 tests PASS (4 config + 3 llm).

**Step 7: Commit**

```bash
git add packages/core/
git commit -m "feat: add OpenRouter LLM client with tool call parsing"
```

---

## Task 7: Package `@augure/channels` — Telegram channel

**Files:**
- Create: `packages/channels/package.json`
- Create: `packages/channels/tsconfig.json`
- Create: `packages/channels/vitest.config.ts`
- Create: `packages/channels/src/telegram.ts`
- Create: `packages/channels/src/index.ts`
- Test: `packages/channels/src/__tests__/telegram.test.ts`

**Step 1: Create `packages/channels/package.json`**

```json
{
  "name": "@augure/channels",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

**Step 2: Install grammy**

```bash
pnpm add --filter @augure/channels grammy
```

**Step 3: Create `packages/channels/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

**Step 4: Create `packages/channels/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 5: Write the failing test**

Create `packages/channels/src/__tests__/telegram.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { TelegramChannel } from "../telegram.js";
import type { IncomingMessage } from "@augure/types";

describe("TelegramChannel", () => {
  it("should have correct channel type", () => {
    const channel = new TelegramChannel({
      botToken: "fake-token",
      allowedUsers: [123],
    });
    expect(channel.type).toBe("telegram");
  });

  it("should register message handlers", () => {
    const channel = new TelegramChannel({
      botToken: "fake-token",
      allowedUsers: [123],
    });
    const handler = vi.fn();
    channel.onMessage(handler);
    // Handler is registered (we can't test grammy internals without full integration)
    expect(() => channel.onMessage(handler)).not.toThrow();
  });

  it("should reject messages from unauthorized users", async () => {
    const channel = new TelegramChannel({
      botToken: "fake-token",
      allowedUsers: [123],
    });

    const messages: IncomingMessage[] = [];
    channel.onMessage(async (msg) => {
      messages.push(msg);
    });

    // Simulate an internal filter check
    expect(channel.isUserAllowed(999)).toBe(false);
    expect(channel.isUserAllowed(123)).toBe(true);
  });
});
```

**Step 6: Run test to verify it fails**

```bash
cd packages/channels && pnpm test
```

Expected: FAIL — `TelegramChannel` does not exist.

**Step 7: Implement TelegramChannel**

Create `packages/channels/src/telegram.ts`:

```ts
import { Bot } from "grammy";
import type { Channel, IncomingMessage, OutgoingMessage } from "@augure/types";

export interface TelegramConfig {
  botToken: string;
  allowedUsers: number[];
}

export class TelegramChannel implements Channel {
  readonly type = "telegram" as const;
  private readonly bot: Bot;
  private readonly allowedUsers: Set<number>;
  private handlers: Array<(message: IncomingMessage) => Promise<void>> = [];

  constructor(config: TelegramConfig) {
    this.bot = new Bot(config.botToken);
    this.allowedUsers = new Set(config.allowedUsers);
    this.setupHandlers();
  }

  isUserAllowed(userId: number): boolean {
    return this.allowedUsers.has(userId);
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async send(message: OutgoingMessage): Promise<void> {
    await this.bot.api.sendMessage(Number(message.userId), message.text, {
      parse_mode: "Markdown",
      ...(message.replyTo
        ? { reply_parameters: { message_id: Number(message.replyTo) } }
        : {}),
    });
  }

  private setupHandlers(): void {
    this.bot.on("message:text", async (ctx) => {
      const userId = ctx.from.id;
      if (!this.isUserAllowed(userId)) {
        return;
      }

      const incoming: IncomingMessage = {
        id: String(ctx.message.message_id),
        channelType: "telegram",
        userId: String(userId),
        text: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000),
        replyTo: ctx.message.reply_to_message
          ? String(ctx.message.reply_to_message.message_id)
          : undefined,
      };

      for (const handler of this.handlers) {
        await handler(incoming);
      }
    });
  }
}
```

**Step 8: Create `packages/channels/src/index.ts`**

```ts
export { TelegramChannel } from "./telegram.js";
export type { TelegramConfig } from "./telegram.js";
```

**Step 9: Run tests to verify they pass**

```bash
cd packages/channels && pnpm test
```

Expected: All 3 tests PASS.

**Step 10: Commit**

```bash
git add packages/channels/
git commit -m "feat: add @augure/channels with Telegram integration via grammy"
```

---

## Task 8: Package `@augure/scheduler` — cron job runner

**Files:**
- Create: `packages/scheduler/package.json`
- Create: `packages/scheduler/tsconfig.json`
- Create: `packages/scheduler/vitest.config.ts`
- Create: `packages/scheduler/src/cron.ts`
- Create: `packages/scheduler/src/index.ts`
- Test: `packages/scheduler/src/__tests__/cron.test.ts`

**Step 1: Create `packages/scheduler/package.json`**

```json
{
  "name": "@augure/scheduler",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

**Step 2: Install node-cron**

```bash
pnpm add --filter @augure/scheduler node-cron
pnpm add -D --filter @augure/scheduler @types/node-cron
```

**Step 3: Create tsconfig & vitest config**

`packages/scheduler/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

`packages/scheduler/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 4: Write the failing test**

Create `packages/scheduler/src/__tests__/cron.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { CronScheduler } from "../cron.js";

describe("CronScheduler", () => {
  let scheduler: CronScheduler;

  afterEach(() => {
    scheduler?.stop();
  });

  it("should add and list jobs", () => {
    scheduler = new CronScheduler();
    scheduler.addJob({
      id: "test-job",
      cron: "0 8 * * *",
      prompt: "Do something",
      channel: "telegram",
      enabled: true,
    });

    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("test-job");
  });

  it("should remove a job", () => {
    scheduler = new CronScheduler();
    scheduler.addJob({
      id: "to-remove",
      cron: "0 8 * * *",
      prompt: "Do something",
      channel: "telegram",
      enabled: true,
    });
    scheduler.removeJob("to-remove");
    expect(scheduler.listJobs()).toHaveLength(0);
  });

  it("should reject invalid cron expressions", () => {
    scheduler = new CronScheduler();
    expect(() =>
      scheduler.addJob({
        id: "bad-cron",
        cron: "not a cron",
        prompt: "Do something",
        channel: "telegram",
        enabled: true,
      })
    ).toThrow();
  });

  it("should trigger a job manually", async () => {
    scheduler = new CronScheduler();
    const handler = vi.fn();
    scheduler.onJobTrigger(handler);

    scheduler.addJob({
      id: "manual-job",
      cron: "0 8 * * *",
      prompt: "Run this",
      channel: "telegram",
      enabled: true,
    });

    await scheduler.triggerJob("manual-job");
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manual-job", prompt: "Run this" })
    );
  });

  it("should throw when triggering non-existent job", async () => {
    scheduler = new CronScheduler();
    await expect(scheduler.triggerJob("nope")).rejects.toThrow();
  });
});
```

**Step 5: Run test to verify it fails**

```bash
cd packages/scheduler && pnpm test
```

Expected: FAIL.

**Step 6: Implement CronScheduler**

Create `packages/scheduler/src/cron.ts`:

```ts
import cron from "node-cron";
import type { Job } from "@augure/types";

export class CronScheduler {
  private jobs = new Map<string, Job>();
  private tasks = new Map<string, cron.ScheduledTask>();
  private handlers: Array<(job: Job) => Promise<void>> = [];

  onJobTrigger(handler: (job: Job) => Promise<void>): void {
    this.handlers.push(handler);
  }

  addJob(job: Job): void {
    if (!cron.validate(job.cron)) {
      throw new Error(`Invalid cron expression: ${job.cron}`);
    }

    this.jobs.set(job.id, job);

    if (job.enabled) {
      const task = cron.schedule(job.cron, () => {
        void this.executeJob(job.id);
      });
      this.tasks.set(job.id, task);
    }
  }

  removeJob(id: string): void {
    const task = this.tasks.get(id);
    task?.stop();
    this.tasks.delete(id);
    this.jobs.delete(id);
  }

  listJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  async triggerJob(id: string): Promise<void> {
    await this.executeJob(id);
  }

  start(): void {
    for (const task of this.tasks.values()) {
      task.start();
    }
  }

  stop(): void {
    for (const task of this.tasks.values()) {
      task.stop();
    }
  }

  private async executeJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    job.lastRun = new Date().toISOString();

    for (const handler of this.handlers) {
      await handler(job);
    }
  }
}
```

**Step 7: Create `packages/scheduler/src/index.ts`**

```ts
export { CronScheduler } from "./cron.js";
```

**Step 8: Run tests to verify they pass**

```bash
cd packages/scheduler && pnpm test
```

Expected: All 5 tests PASS.

**Step 9: Commit**

```bash
git add packages/scheduler/
git commit -m "feat: add @augure/scheduler with cron job management"
```

---

## Task 9: Package `@augure/tools` — native tool registry

**Files:**
- Create: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.json`
- Create: `packages/tools/vitest.config.ts`
- Create: `packages/tools/src/registry.ts`
- Create: `packages/tools/src/memory.ts`
- Create: `packages/tools/src/schedule.ts`
- Create: `packages/tools/src/index.ts`
- Test: `packages/tools/src/__tests__/registry.test.ts`

**Step 1: Create `packages/tools/package.json`**

```json
{
  "name": "@augure/tools",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

**Step 2: Create tsconfig & vitest config**

`packages/tools/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [
    { "path": "../types" },
    { "path": "../memory" }
  ]
}
```

`packages/tools/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 3: Write the failing test**

Create `packages/tools/src/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../registry.js";
import type { NativeTool, ToolResult } from "@augure/types";

const fakeTool: NativeTool = {
  name: "test_tool",
  description: "A test tool",
  parameters: {
    type: "object",
    properties: { input: { type: "string" } },
  },
  execute: async (_params): Promise<ToolResult> => ({
    success: true,
    output: "tool executed",
  }),
};

describe("ToolRegistry", () => {
  it("should register and retrieve a tool", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool);
    expect(registry.get("test_tool")).toBe(fakeTool);
  });

  it("should return undefined for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("should list all tools", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool);
    const tools = registry.list();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("test_tool");
  });

  it("should generate tool schemas for LLM function calling", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool);
    const schemas = registry.toFunctionSchemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0]).toEqual({
      type: "function",
      function: {
        name: "test_tool",
        description: "A test tool",
        parameters: fakeTool.parameters,
      },
    });
  });

  it("should execute a tool by name", async () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool);
    const result = await registry.execute("test_tool", { input: "hello" });
    expect(result.success).toBe(true);
    expect(result.output).toBe("tool executed");
  });

  it("should throw on executing unknown tool", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("nope", {})).rejects.toThrow();
  });
});
```

**Step 4: Run test to verify it fails**

```bash
cd packages/tools && pnpm test
```

**Step 5: Implement ToolRegistry**

Create `packages/tools/src/registry.ts`:

```ts
import type { NativeTool, ToolResult, ToolContext } from "@augure/types";

export interface FunctionSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class ToolRegistry {
  private tools = new Map<string, NativeTool>();
  private ctx?: ToolContext;

  setContext(ctx: ToolContext): void {
    this.ctx = ctx;
  }

  register(tool: NativeTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): NativeTool | undefined {
    return this.tools.get(name);
  }

  list(): NativeTool[] {
    return Array.from(this.tools.values());
  }

  toFunctionSchemas(): FunctionSchema[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(params, this.ctx!);
  }
}
```

**Step 6: Create stub tool implementations**

Create `packages/tools/src/memory.ts`:

```ts
import type { NativeTool, ToolResult } from "@augure/types";

interface MemoryReadParams {
  path: string;
}

interface MemoryWriteParams {
  path: string;
  content: string;
}

export const memoryReadTool: NativeTool = {
  name: "memory_read",
  description: "Read a file from the agent's persistent memory store",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path within memory/" },
    },
    required: ["path"],
  },
  execute: async (_params): Promise<ToolResult> => {
    // Will be wired to MemoryStore via ToolContext in Task 11
    return { success: false, output: "Not wired yet" };
  },
};

export const memoryWriteTool: NativeTool = {
  name: "memory_write",
  description: "Write content to a file in the agent's persistent memory store",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path within memory/" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  execute: async (_params): Promise<ToolResult> => {
    return { success: false, output: "Not wired yet" };
  },
};
```

Create `packages/tools/src/schedule.ts`:

```ts
import type { NativeTool, ToolResult } from "@augure/types";

export const scheduleTool: NativeTool = {
  name: "schedule",
  description: "Create, update, or delete a scheduled cron job",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "delete", "list"],
        description: "Action to perform",
      },
      id: { type: "string", description: "Job ID" },
      cron: { type: "string", description: "Cron expression" },
      prompt: { type: "string", description: "Prompt to execute on trigger" },
    },
    required: ["action"],
  },
  execute: async (_params): Promise<ToolResult> => {
    return { success: false, output: "Not wired yet" };
  },
};
```

**Step 7: Create `packages/tools/src/index.ts`**

```ts
export { ToolRegistry } from "./registry.js";
export type { FunctionSchema } from "./registry.js";
export { memoryReadTool, memoryWriteTool } from "./memory.js";
export { scheduleTool } from "./schedule.js";
```

**Step 8: Run tests to verify they pass**

```bash
cd packages/tools && pnpm test
```

Expected: All 6 tests PASS.

**Step 9: Commit**

```bash
git add packages/tools/
git commit -m "feat: add @augure/tools with tool registry and stub native tools"
```

---

## Task 10: Package `@augure/sandbox` and `@augure/skills` — stubs

These packages are more complex and not needed for the M0 agent loop. We create stub packages so the monorepo structure is complete and dependencies resolve.

**Files:**
- Create: `packages/sandbox/package.json`
- Create: `packages/sandbox/tsconfig.json`
- Create: `packages/sandbox/vitest.config.ts`
- Create: `packages/sandbox/src/index.ts`
- Create: `packages/skills/package.json`
- Create: `packages/skills/tsconfig.json`
- Create: `packages/skills/vitest.config.ts`
- Create: `packages/skills/src/index.ts`

**Step 1: Create `packages/sandbox/package.json`**

```json
{
  "name": "@augure/sandbox",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

**Step 2: Create `packages/sandbox/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

**Step 3: Create `packages/sandbox/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 4: Create `packages/sandbox/src/index.ts`**

```ts
// @augure/sandbox — Container pool management
// Stub: will be implemented in M2-M3

export const SANDBOX_VERSION = "0.0.1";
```

**Step 5: Create `packages/skills/package.json`**

```json
{
  "name": "@augure/skills",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  }
}
```

**Step 6: Create `packages/skills/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

**Step 7: Create `packages/skills/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 8: Create `packages/skills/src/index.ts`**

```ts
// @augure/skills — Skill system (self-learning)
// Stub: will be implemented in M2

export const SKILLS_VERSION = "0.0.1";
```

**Step 9: Commit**

```bash
git add packages/sandbox/ packages/skills/
git commit -m "chore: add stub packages for @augure/sandbox and @augure/skills"
```

---

## Task 11: Agent loop — context assembly + orchestrator

The core agent loop: receive message → assemble context → call LLM → handle tool calls → respond.

**Files:**
- Create: `packages/core/src/context.ts`
- Create: `packages/core/src/agent.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/context.test.ts`
- Test: `packages/core/src/__tests__/agent.test.ts`

**Step 1: Write context assembly test**

Create `packages/core/src/__tests__/context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleContext } from "../context.js";
import type { Message } from "@augure/types";

describe("assembleContext", () => {
  it("should assemble system prompt + memory + conversation", () => {
    const history: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const messages = assembleContext({
      systemPrompt: "You are Augure.",
      memoryContent: "User prefers French.",
      toolSchemas: [],
      conversationHistory: history,
    });

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("You are Augure.");
    expect(messages[0].content).toContain("User prefers French.");
    expect(messages).toHaveLength(3); // system + 2 history
  });

  it("should include tool descriptions in system prompt", () => {
    const messages = assembleContext({
      systemPrompt: "You are Augure.",
      memoryContent: "",
      toolSchemas: [
        {
          type: "function" as const,
          function: {
            name: "web_search",
            description: "Search the web",
            parameters: {},
          },
        },
      ],
      conversationHistory: [],
    });

    expect(messages[0].content).toContain("web_search");
  });

  it("should keep system prompt when conversation history is empty", () => {
    const messages = assembleContext({
      systemPrompt: "You are Augure.",
      memoryContent: "",
      toolSchemas: [],
      conversationHistory: [],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test -- context
```

**Step 3: Implement context assembly**

Create `packages/core/src/context.ts`:

```ts
import type { Message } from "@augure/types";
import type { FunctionSchema } from "@augure/tools";

export interface ContextInput {
  systemPrompt: string;
  memoryContent: string;
  toolSchemas: FunctionSchema[];
  conversationHistory: Message[];
  persona?: string;
}

export function assembleContext(input: ContextInput): Message[] {
  const { systemPrompt, memoryContent, toolSchemas, conversationHistory, persona } = input;

  let system = systemPrompt;

  if (persona) {
    system += `\n\n## Active Persona\n${persona}`;
  }

  if (memoryContent) {
    system += `\n\n## Memory\n${memoryContent}`;
  }

  if (toolSchemas.length > 0) {
    const toolList = toolSchemas
      .map((s) => `- **${s.function.name}**: ${s.function.description}`)
      .join("\n");
    system += `\n\n## Available Tools\n${toolList}`;
  }

  const messages: Message[] = [{ role: "system", content: system }];
  messages.push(...conversationHistory);

  return messages;
}
```

**Step 4: Run context tests**

```bash
cd packages/core && pnpm test -- context
```

Expected: All 3 PASS.

**Step 5: Write agent loop test**

Create `packages/core/src/__tests__/agent.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Agent } from "../agent.js";
import type { LLMClient, LLMResponse, Message, IncomingMessage } from "@augure/types";
import { ToolRegistry } from "@augure/tools";

function createMockLLM(response: Partial<LLMResponse> = {}): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response.content ?? "Mock response",
      toolCalls: response.toolCalls ?? [],
      usage: response.usage ?? { inputTokens: 10, outputTokens: 5 },
    }),
  };
}

describe("Agent", () => {
  it("should process a message and return LLM response", async () => {
    const llm = createMockLLM({ content: "Bonjour!" });
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    const response = await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Salut",
      timestamp: new Date(),
    });

    expect(response).toBe("Bonjour!");
    expect(llm.chat).toHaveBeenCalledOnce();
  });

  it("should include memory in context", async () => {
    const llm = createMockLLM();
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "User prefers French.",
    });

    await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Hello",
      timestamp: new Date(),
    });

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message[];
    const systemMsg = callArgs.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("User prefers French.");
  });

  it("should handle tool calls and loop", async () => {
    const llm: LLMClient = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: "",
          toolCalls: [
            { id: "tc1", name: "test_tool", arguments: { input: "hello" } },
          ],
          usage: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          content: "Done with tool result!",
          toolCalls: [],
          usage: { inputTokens: 20, outputTokens: 10 },
        }),
    };

    const tools = new ToolRegistry();
    tools.register({
      name: "test_tool",
      description: "test",
      parameters: {},
      execute: async () => ({
        success: true,
        output: "tool output",
      }),
    });

    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    const response = await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "Use the tool",
      timestamp: new Date(),
    });

    expect(response).toBe("Done with tool result!");
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  it("should maintain conversation history across messages", async () => {
    const llm = createMockLLM({ content: "Reply 2" });
    const tools = new ToolRegistry();
    const agent = new Agent({
      llm,
      tools,
      systemPrompt: "You are Augure.",
      memoryContent: "",
    });

    await agent.handleMessage({
      id: "1",
      channelType: "telegram",
      userId: "123",
      text: "First message",
      timestamp: new Date(),
    });

    await agent.handleMessage({
      id: "2",
      channelType: "telegram",
      userId: "123",
      text: "Second message",
      timestamp: new Date(),
    });

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[1][0] as Message[];
    const userMessages = callArgs.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(2);
  });
});
```

**Step 6: Run test to verify it fails**

```bash
cd packages/core && pnpm test -- agent
```

**Step 7: Implement Agent**

Create `packages/core/src/agent.ts`:

```ts
import type { LLMClient, Message, IncomingMessage } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import { assembleContext } from "./context.js";

export interface AgentConfig {
  llm: LLMClient;
  tools: ToolRegistry;
  systemPrompt: string;
  memoryContent: string;
  persona?: string;
  maxToolLoops?: number;
}

export class Agent {
  private readonly config: AgentConfig;
  private conversationHistory: Message[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async handleMessage(incoming: IncomingMessage): Promise<string> {
    this.conversationHistory.push({
      role: "user",
      content: incoming.text,
    });

    const maxLoops = this.config.maxToolLoops ?? 10;
    let loopCount = 0;

    while (loopCount < maxLoops) {
      const messages = assembleContext({
        systemPrompt: this.config.systemPrompt,
        memoryContent: this.config.memoryContent,
        toolSchemas: this.config.tools.toFunctionSchemas(),
        conversationHistory: this.conversationHistory,
        persona: this.config.persona,
      });

      const response = await this.config.llm.chat(messages);

      if (response.toolCalls.length === 0) {
        this.conversationHistory.push({
          role: "assistant",
          content: response.content,
        });
        return response.content;
      }

      // Handle tool calls
      this.conversationHistory.push({
        role: "assistant",
        content: response.content || "",
      });

      for (const toolCall of response.toolCalls) {
        const result = await this.config.tools.execute(
          toolCall.name,
          toolCall.arguments
        );
        this.conversationHistory.push({
          role: "tool",
          content: result.output,
          toolCallId: toolCall.id,
        });
      }

      loopCount++;
    }

    return "Max tool call loops reached. Please try again.";
  }

  getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
```

**Step 8: Update `packages/core/src/index.ts`**

```ts
export { loadConfig } from "./config.js";
export { OpenRouterClient } from "./llm.js";
export type { OpenRouterConfig } from "./llm.js";
export { assembleContext } from "./context.js";
export type { ContextInput } from "./context.js";
export { Agent } from "./agent.js";
export type { AgentConfig } from "./agent.js";
```

**Step 9: Update `packages/core/tsconfig.json` to add tools reference**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [
    { "path": "../types" },
    { "path": "../tools" }
  ]
}
```

**Step 10: Run all core tests**

```bash
cd packages/core && pnpm test
```

Expected: All tests PASS (config: 4, llm: 3, context: 3, agent: 4 = 14 total).

**Step 11: Commit**

```bash
git add packages/core/
git commit -m "feat: add agent loop with context assembly and tool call handling"
```

---

## Task 12: Entrypoint — wire everything together

**Files:**
- Create: `packages/core/src/main.ts`
- Create: `config/augure.example.json5`
- Create: `memory/.gitkeep`
- Create: `skills/.gitkeep`
- Create: `logs/.gitkeep`

**Step 1: Create `config/augure.example.json5`**

```json5
{
  // Identity
  identity: {
    name: "Augure",
    personality: "Helpful, proactive, concise. Speaks French by default.",
  },

  // LLM (default config — override per usage type below)
  llm: {
    default: {
      provider: "openrouter",
      apiKey: "${OPENROUTER_API_KEY}",
      model: "anthropic/claude-sonnet-4-5",
      maxTokens: 8192,
    },
  },

  // Channels
  channels: {
    telegram: {
      enabled: true,
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowedUsers: [], // Add your Telegram user ID
    },
  },

  // Memory
  memory: {
    path: "./memory",
    autoIngest: true,
    maxRetrievalTokens: 2000,
  },

  // Scheduler
  scheduler: {
    heartbeatInterval: "30m",
    jobs: [],
  },

  // Sandbox
  sandbox: {
    runtime: "docker",
    defaults: {
      timeout: 300,
      memoryLimit: "512m",
      cpuLimit: "1.0",
    },
  },

  // Tools
  tools: {},

  // Security
  security: {
    sandboxOnly: true,
    allowedHosts: [],
    maxConcurrentSandboxes: 3,
  },
}
```

**Step 2: Create `packages/core/src/main.ts`**

```ts
import { loadConfig } from "./config.js";
import { OpenRouterClient } from "./llm.js";
import { Agent } from "./agent.js";
import { TelegramChannel } from "@augure/channels";
import { ToolRegistry, memoryReadTool, memoryWriteTool } from "@augure/tools";
import { FileMemoryStore } from "@augure/memory";
import { CronScheduler } from "@augure/scheduler";
import { resolve } from "node:path";

const SYSTEM_PROMPT = `You are Augure, a personal AI assistant. You are proactive, helpful, and concise.
You speak the same language as the user. You have access to tools and persistent memory.
Always be direct and actionable.`;

export async function startAgent(configPath: string): Promise<void> {
  // 1. Load config
  const config = await loadConfig(configPath);
  console.log(`[augure] Loaded config: ${config.identity.name}`);

  // 2. Init LLM
  const llm = new OpenRouterClient({
    apiKey: config.llm.default.apiKey,
    model: config.llm.default.model,
    maxTokens: config.llm.default.maxTokens,
  });

  // 3. Init memory
  const memoryPath = resolve(configPath, "..", config.memory.path);
  const memory = new FileMemoryStore(memoryPath);
  console.log(`[augure] Memory store: ${memoryPath}`);

  // 4. Load memory content for context
  let memoryContent = "";
  try {
    if (await memory.exists("observations.md")) {
      memoryContent = await memory.read("observations.md");
    }
    if (await memory.exists("identity.md")) {
      memoryContent += "\n\n" + (await memory.read("identity.md"));
    }
  } catch {
    console.log("[augure] No existing memory found, starting fresh.");
  }

  // 5. Init tools
  const tools = new ToolRegistry();
  tools.register(memoryReadTool);
  tools.register(memoryWriteTool);

  // 6. Init scheduler
  const scheduler = new CronScheduler();
  for (const job of config.scheduler.jobs) {
    scheduler.addJob({ ...job, enabled: true });
  }

  // 7. Init agent
  const agent = new Agent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    memoryContent,
  });

  // 8. Init Telegram channel
  if (config.channels.telegram?.enabled) {
    const telegram = new TelegramChannel({
      botToken: config.channels.telegram.botToken,
      allowedUsers: config.channels.telegram.allowedUsers,
    });

    telegram.onMessage(async (msg) => {
      console.log(`[augure] Message from ${msg.userId}: ${msg.text}`);
      try {
        const response = await agent.handleMessage(msg);
        await telegram.send({
          channelType: "telegram",
          userId: msg.userId,
          text: response,
          replyTo: msg.id,
        });
      } catch (err) {
        console.error("[augure] Error handling message:", err);
        await telegram.send({
          channelType: "telegram",
          userId: msg.userId,
          text: "An error occurred while processing your message.",
        });
      }
    });

    await telegram.start();
    console.log("[augure] Telegram bot started. Waiting for messages...");
  }

  // 9. Start scheduler
  scheduler.start();
  console.log(`[augure] Scheduler started with ${config.scheduler.jobs.length} jobs.`);

  // 10. Handle shutdown
  const shutdown = async () => {
    console.log("\n[augure] Shutting down...");
    scheduler.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// CLI entrypoint
const configPath = process.argv[2] ?? "./config/augure.json5";
startAgent(configPath).catch((err) => {
  console.error("[augure] Fatal error:", err);
  process.exit(1);
});
```

**Step 3: Add bin script to core package.json**

Add to `packages/core/package.json`:

```json
{
  "bin": {
    "augure": "./dist/main.js"
  }
}
```

**Step 4: Create directory placeholders**

```bash
mkdir -p memory skills logs
touch memory/.gitkeep skills/.gitkeep logs/.gitkeep
```

**Step 5: Commit**

```bash
git add packages/core/src/main.ts config/ memory/.gitkeep skills/.gitkeep logs/.gitkeep
git commit -m "feat: add agent entrypoint wiring all packages together"
```

---

## Task 13: Install all dependencies and verify build

**Step 1: Install all deps**

```bash
pnpm install
```

**Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: No type errors across all packages.

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass across all packages.

**Step 4: Verify lint passes**

```bash
pnpm lint
```

Fix any lint issues if needed.

**Step 5: Commit any lockfile/config changes**

```bash
git add pnpm-lock.yaml
git commit -m "chore: install all dependencies and verify build"
```

---

## Task 14: Docker & deployment scaffolding

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `containers/augure-sandbox/Dockerfile`
- Create: `containers/augure-sandbox/entrypoint.sh`

**Step 1: Create root `Dockerfile`**

```dockerfile
FROM node:22-slim AS base
RUN corepack enable pnpm

WORKDIR /app

# Install deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/core/package.json packages/core/
COPY packages/memory/package.json packages/memory/
COPY packages/channels/package.json packages/channels/
COPY packages/scheduler/package.json packages/scheduler/
COPY packages/tools/package.json packages/tools/
COPY packages/sandbox/package.json packages/sandbox/
COPY packages/skills/package.json packages/skills/
RUN pnpm install --frozen-lockfile

# Copy source & build
COPY tsconfig.base.json turbo.json ./
COPY packages/ packages/
RUN pnpm build

# Run
CMD ["node", "packages/core/dist/main.js", "/app/config/augure.json5"]
```

**Step 2: Create `docker-compose.yml`**

```yaml
services:
  augure:
    build: .
    restart: unless-stopped
    volumes:
      - ./config:/app/config:ro
      - ./memory:/app/memory
      - ./logs:/app/logs
      - ./skills:/app/skills
      - /var/run/docker.sock:/var/run/docker.sock
    env_file: .env
    # No ports exposed — Telegram uses outbound polling only
```

**Step 3: Create sandbox Dockerfile**

`containers/augure-sandbox/Dockerfile`:

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    curl jq git ripgrep \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

`containers/augure-sandbox/entrypoint.sh`:

```bash
#!/bin/bash
set -e

# Execute the task passed as arguments
if [ "$#" -gt 0 ]; then
  exec "$@"
else
  echo "No command provided. Waiting..."
  tail -f /dev/null
fi
```

**Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml containers/
git commit -m "chore: add Docker and deployment scaffolding"
```

---

## Task 15: Final verification + initial commit to main

**Step 1: Run full CI-style check**

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test
```

Expected: All green.

**Step 2: Verify the monorepo structure**

```bash
ls packages/
# Expected: channels  core  memory  sandbox  scheduler  skills  tools  types
```

**Step 3: Check total LOC**

```bash
find packages/ -name '*.ts' ! -name '*.test.ts' ! -name '*.config.ts' ! -path '*/dist/*' | xargs wc -l
```

Expected: ~600-800 LOC — well within the <10K target.

**Step 4: Rename branch and push initial commit**

```bash
git branch -m master main
```

**Step 5: Final commit (if any straggling files)**

```bash
git add -A && git status
# If there are changes:
git commit -m "chore: final cleanup for monorepo init"
```

---

## Summary

| Task | Package | What it does | Tests |
|------|---------|--------------|-------|
| 1 | root | Monorepo scaffolding (pnpm, turbo) | — |
| 2 | root | Shared TS, ESLint, Vitest config | — |
| 3 | `@augure/types` | All shared interfaces | — |
| 4 | `@augure/memory` | FileMemoryStore (filesystem) | 7 |
| 5 | `@augure/core` | Config loader (JSON5 + env vars + zod) | 4 |
| 6 | `@augure/core` | OpenRouter LLM client | 3 |
| 7 | `@augure/channels` | Telegram channel (grammy) | 3 |
| 8 | `@augure/scheduler` | Cron scheduler (node-cron) | 5 |
| 9 | `@augure/tools` | Tool registry + stub tools | 6 |
| 10 | `@augure/sandbox`, `@augure/skills` | Stub packages | — |
| 11 | `@augure/core` | Agent loop + context assembly | 7 |
| 12 | `@augure/core` | Entrypoint wiring everything | — |
| 13 | all | Install deps, verify build | — |
| 14 | root | Docker + deployment scaffolding | — |
| 15 | root | Final verification | — |

**Total: 15 tasks, ~35 tests, 8 packages, ~700 LOC**
