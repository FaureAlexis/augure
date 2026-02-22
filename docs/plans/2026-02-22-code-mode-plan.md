# Code Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the classic N-tool function-calling loop with a single `execute_code` tool where the LLM writes TypeScript that calls typed APIs in a sandbox.

**Architecture:** New `@augure/code-mode` package with 4 components: typegen (ToolRegistry → TS declarations), bridge (Proxy routing API calls to host), VM executor (isolated-vm, fast default), Docker executor (container, powerful fallback). The Agent loop changes from dispatching N tools to executing one code block.

**Tech Stack:** `isolated-vm` (V8 isolates), `esbuild` (TS transpile), existing `@augure/sandbox` for Docker mode.

**Design doc:** `docs/plans/2026-02-22-code-mode-design.md`

---

### Task 1: Scaffold `@augure/code-mode` package

**Files:**
- Create: `packages/code-mode/package.json`
- Create: `packages/code-mode/tsconfig.json`
- Create: `packages/code-mode/vitest.config.ts`
- Create: `packages/code-mode/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@augure/code-mode",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js"
    }
  },
  "dependencies": {
    "@augure/types": "workspace:*",
    "@augure/tools": "workspace:*",
    "@augure/sandbox": "workspace:*",
    "esbuild": "^0.25.0",
    "isolated-vm": "^5.0.0"
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

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "references": [
    { "path": "../types" },
    { "path": "../tools" },
    { "path": "../sandbox" }
  ]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
```

**Step 4: Create empty src/index.ts**

```typescript
// @augure/code-mode — Code Mode execution engine
```

**Step 5: Install dependencies**

Run: `pnpm install`
Expected: lockfile updated, isolated-vm and esbuild installed

**Step 6: Verify build works**

Run: `pnpm --filter @augure/code-mode build`
Expected: compiles successfully (empty index)

**Step 7: Commit**

```bash
git add packages/code-mode/
git commit -m "feat(code-mode): scaffold @augure/code-mode package"
```

---

### Task 2: Implement typegen — ToolRegistry → TypeScript declarations

**Files:**
- Create: `packages/code-mode/src/typegen.ts`
- Create: `packages/code-mode/src/__tests__/typegen.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { generateDeclarations, sanitizeName } from "../typegen.js";
import type { NativeTool } from "@augure/types";
import { ToolRegistry } from "@augure/tools";

function stubTool(name: string, params: Record<string, unknown>): NativeTool {
  return {
    name,
    description: `${name} description`,
    parameters: {
      type: "object",
      properties: params,
      required: Object.keys(params).slice(0, 1),
    },
    execute: async () => ({ success: true, output: "" }),
  };
}

describe("sanitizeName", () => {
  it("replaces hyphens with underscores", () => {
    expect(sanitizeName("my-tool")).toBe("my_tool");
  });

  it("replaces dots with underscores", () => {
    expect(sanitizeName("server.list")).toBe("server_list");
  });

  it("leaves valid identifiers unchanged", () => {
    expect(sanitizeName("memory_read")).toBe("memory_read");
  });
});

describe("generateDeclarations", () => {
  it("generates TS declarations from a registry with one tool", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("memory_read", {
      path: { type: "string", description: "File path to read" },
    }));

    const result = generateDeclarations(registry);

    expect(result).toContain("interface MemoryReadInput");
    expect(result).toContain("path: string");
    expect(result).toContain("declare const api");
    expect(result).toContain("memory_read: (input: MemoryReadInput) => Promise<{ success: boolean; output: string }>");
  });

  it("marks non-required properties as optional", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "http",
      description: "HTTP request",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string" },
        },
        required: ["url"],
      },
      execute: async () => ({ success: true, output: "" }),
    });

    const result = generateDeclarations(registry);

    expect(result).toContain("url: string");
    expect(result).toContain("method?: string");
  });

  it("handles multiple tools", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("tool_a", { input: { type: "string" } }));
    registry.register(stubTool("tool_b", { count: { type: "number" } }));

    const result = generateDeclarations(registry);

    expect(result).toContain("tool_a:");
    expect(result).toContain("tool_b:");
  });

  it("sanitizes tool names with hyphens", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("my-tool", { input: { type: "string" } }));

    const result = generateDeclarations(registry);

    expect(result).toContain("my_tool:");
    expect(result).toContain("MyToolInput");
  });

  it("adds JSDoc comments from descriptions", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("echo", { msg: { type: "string", description: "The message" } }));

    const result = generateDeclarations(registry);

    expect(result).toContain("/** echo description */");
    expect(result).toContain("/** The message */");
  });

  it("maps JSON schema types to TS types", () => {
    const registry = new ToolRegistry();
    registry.register(stubTool("types_test", {
      s: { type: "string" },
      n: { type: "number" },
      b: { type: "boolean" },
      a: { type: "array" },
      o: { type: "object" },
    }));

    const result = generateDeclarations(registry);

    expect(result).toContain("s: string");
    expect(result).toContain("n: number");
    expect(result).toContain("b: boolean");
    expect(result).toContain("a: unknown[]");
    expect(result).toContain("o: Record<string, unknown>");
  });

  it("returns empty api for empty registry", () => {
    const registry = new ToolRegistry();
    const result = generateDeclarations(registry);
    expect(result).toContain("declare const api: {");
    expect(result).toContain("};");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/code-mode && npx vitest run src/__tests__/typegen.test.ts`
Expected: FAIL — module `../typegen.js` not found

**Step 3: Implement typegen.ts**

```typescript
import type { ToolRegistry } from "@augure/tools";

const JSON_TO_TS: Record<string, string> = {
  string: "string",
  number: "number",
  integer: "number",
  boolean: "boolean",
  array: "unknown[]",
  object: "Record<string, unknown>",
};

export function sanitizeName(name: string): string {
  return name.replace(/[-. ]/g, "_");
}

function toPascalCase(name: string): string {
  return sanitizeName(name)
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function mapType(schema: Record<string, unknown>): string {
  const t = schema.type as string | undefined;
  if (schema.enum) {
    return (schema.enum as string[]).map((v) => `"${v}"`).join(" | ");
  }
  return JSON_TO_TS[t ?? "string"] ?? "unknown";
}

export function generateDeclarations(registry: ToolRegistry): string {
  const tools = registry.list();
  const blocks: string[] = [];
  const apiEntries: string[] = [];

  for (const tool of tools) {
    const safeName = sanitizeName(tool.name);
    const interfaceName = `${toPascalCase(tool.name)}Input`;
    const params = tool.parameters as {
      properties?: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    const properties = params.properties ?? {};
    const required = new Set(params.required ?? []);

    // Build interface
    const fields: string[] = [];
    for (const [key, schema] of Object.entries(properties)) {
      const optional = required.has(key) ? "" : "?";
      const tsType = mapType(schema);
      const desc = schema.description as string | undefined;
      if (desc) {
        fields.push(`  /** ${desc} */\n  ${key}${optional}: ${tsType};`);
      } else {
        fields.push(`  ${key}${optional}: ${tsType};`);
      }
    }

    blocks.push(`interface ${interfaceName} {\n${fields.join("\n")}\n}`);

    // Build api entry
    apiEntries.push(
      `  /** ${tool.description} */\n  ${safeName}: (input: ${interfaceName}) => Promise<{ success: boolean; output: string }>;`,
    );
  }

  const apiBlock = `declare const api: {\n${apiEntries.join("\n")}\n};`;
  return [...blocks, "", apiBlock].join("\n");
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/code-mode && npx vitest run src/__tests__/typegen.test.ts`
Expected: all tests PASS

**Step 5: Export from index.ts**

Update `packages/code-mode/src/index.ts`:
```typescript
export { generateDeclarations, sanitizeName } from "./typegen.js";
```

**Step 6: Commit**

```bash
git add packages/code-mode/src/typegen.ts packages/code-mode/src/__tests__/typegen.test.ts packages/code-mode/src/index.ts
git commit -m "feat(code-mode): implement typegen — ToolRegistry to TypeScript declarations"
```

---

### Task 3: Implement the bridge — Proxy routing API calls to host

**Files:**
- Create: `packages/code-mode/src/bridge.ts`
- Create: `packages/code-mode/src/__tests__/bridge.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { createBridgeHandler, generateHarnessCode } from "../bridge.js";
import type { NativeTool, ToolContext } from "@augure/types";
import { ToolRegistry } from "@augure/tools";

function stubTool(name: string): NativeTool {
  return {
    name,
    description: `${name} tool`,
    parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
    execute: vi.fn(async (params: unknown) => ({
      success: true,
      output: `result from ${name}: ${JSON.stringify(params)}`,
    })),
  };
}

describe("createBridgeHandler", () => {
  it("dispatches a tool call to the registry", async () => {
    const registry = new ToolRegistry();
    const tool = stubTool("echo");
    registry.register(tool);
    registry.setContext({} as ToolContext);

    const handler = createBridgeHandler(registry);
    const result = await handler("echo", { input: "hello" });

    expect(result).toEqual({
      success: true,
      output: 'result from echo: {"input":"hello"}',
    });
    expect(tool.execute).toHaveBeenCalledWith({ input: "hello" }, expect.anything());
  });

  it("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    registry.setContext({} as ToolContext);

    const handler = createBridgeHandler(registry);
    const result = await handler("nonexistent", {});

    expect(result.success).toBe(false);
    expect(result.output).toContain("nonexistent");
  });

  it("catches tool execution errors", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "broken",
      description: "breaks",
      parameters: { type: "object", properties: {} },
      execute: async () => { throw new Error("boom"); },
    });
    registry.setContext({} as ToolContext);

    const handler = createBridgeHandler(registry);
    const result = await handler("broken", {});

    expect(result.success).toBe(false);
    expect(result.output).toContain("boom");
  });
});

describe("generateHarnessCode", () => {
  it("wraps user code in an async function with api proxy", () => {
    const harness = generateHarnessCode("return await api.echo({ input: 'hi' });");

    expect(harness).toContain("new Proxy");
    expect(harness).toContain("__bridge");
    expect(harness).toContain("return await api.echo");
    expect(harness).toContain("console.log");
  });

  it("captures console output", () => {
    const harness = generateHarnessCode("console.log('test');");
    expect(harness).toContain("__logs");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/code-mode && npx vitest run src/__tests__/bridge.test.ts`
Expected: FAIL

**Step 3: Implement bridge.ts**

```typescript
import type { ToolResult } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";

export type BridgeHandler = (toolName: string, input: unknown) => Promise<ToolResult>;

export function createBridgeHandler(registry: ToolRegistry): BridgeHandler {
  return async (toolName: string, input: unknown): Promise<ToolResult> => {
    try {
      return await registry.execute(toolName, input);
    } catch (err) {
      return {
        success: false,
        output: `Bridge error calling ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}

export function generateHarnessCode(userCode: string): string {
  return `
const __logs = [];
const __originalLog = console.log;
const __originalWarn = console.warn;
const __originalError = console.error;
console.log = (...args) => __logs.push(args.map(String).join(" "));
console.warn = (...args) => __logs.push("[warn] " + args.map(String).join(" "));
console.error = (...args) => __logs.push("[error] " + args.map(String).join(" "));

let __toolCalls = 0;

const api = new Proxy({}, {
  get: (_target, toolName) => {
    return async (input) => {
      __toolCalls++;
      return await __bridge(String(toolName), input);
    };
  }
});

async function __run() {
  ${userCode}
}

try {
  const __result = await __run();
  __originalLog(JSON.stringify({
    success: true,
    output: __result,
    logs: __logs,
    toolCalls: __toolCalls,
  }));
} catch (err) {
  __originalLog(JSON.stringify({
    success: false,
    error: err.message ?? String(err),
    logs: __logs,
    toolCalls: __toolCalls,
  }));
}
`;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/code-mode && npx vitest run src/__tests__/bridge.test.ts`
Expected: PASS

**Step 5: Export from index.ts**

Add to `packages/code-mode/src/index.ts`:
```typescript
export { createBridgeHandler, generateHarnessCode } from "./bridge.js";
export type { BridgeHandler } from "./bridge.js";
```

**Step 6: Commit**

```bash
git add packages/code-mode/src/bridge.ts packages/code-mode/src/__tests__/bridge.test.ts packages/code-mode/src/index.ts
git commit -m "feat(code-mode): implement bridge — proxy routing API calls to ToolRegistry"
```

---

### Task 4: Implement VM executor — isolated-vm sandbox

**Files:**
- Create: `packages/code-mode/src/executor.ts` (interface + types)
- Create: `packages/code-mode/src/vm-sandbox.ts`
- Create: `packages/code-mode/src/__tests__/vm-sandbox.test.ts`

**Step 1: Create the executor interface**

```typescript
// executor.ts
export interface CodeModeResult {
  success: boolean;
  output: unknown;
  logs: string[];
  error?: string;
  durationMs: number;
  toolCalls: number;
}

export interface CodeModeExecutor {
  execute(code: string): Promise<CodeModeResult>;
}
```

**Step 2: Write the failing tests for VmExecutor**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VmExecutor } from "../vm-sandbox.js";
import type { NativeTool, ToolContext } from "@augure/types";
import { ToolRegistry } from "@augure/tools";

function stubTool(name: string, fn?: (params: unknown) => Promise<{ success: boolean; output: string }>): NativeTool {
  return {
    name,
    description: `${name} tool`,
    parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
    execute: fn ?? (async (params: unknown) => ({
      success: true,
      output: `${name}: ${JSON.stringify(params)}`,
    })),
  };
}

function makeRegistry(...tools: NativeTool[]): ToolRegistry {
  const r = new ToolRegistry();
  for (const t of tools) r.register(t);
  r.setContext({} as ToolContext);
  return r;
}

describe("VmExecutor", () => {
  it("executes simple code that returns a value", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor({ registry, timeout: 5000, memoryLimit: 64 });

    const result = await executor.execute("return 42;");

    expect(result.success).toBe(true);
    expect(result.output).toBe(42);
    expect(result.toolCalls).toBe(0);
  });

  it("executes code that calls a tool via api proxy", async () => {
    const registry = makeRegistry(stubTool("echo"));
    const executor = new VmExecutor({ registry, timeout: 5000, memoryLimit: 64 });

    const result = await executor.execute('return await api.echo({ input: "hello" });');

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ success: true, output: 'echo: {"input":"hello"}' });
    expect(result.toolCalls).toBe(1);
  });

  it("captures console.log output", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor({ registry, timeout: 5000, memoryLimit: 64 });

    const result = await executor.execute('console.log("hello"); console.log("world"); return "done";');

    expect(result.logs).toEqual(["hello", "world"]);
  });

  it("handles code that throws", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor({ registry, timeout: 5000, memoryLimit: 64 });

    const result = await executor.execute('throw new Error("boom");');

    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("handles code that calls multiple tools", async () => {
    const registry = makeRegistry(
      stubTool("read"),
      stubTool("write"),
    );
    const executor = new VmExecutor({ registry, timeout: 5000, memoryLimit: 64 });

    const result = await executor.execute(`
      const data = await api.read({ input: "file.txt" });
      await api.write({ input: data.output });
      return "done";
    `);

    expect(result.success).toBe(true);
    expect(result.toolCalls).toBe(2);
  });

  it("times out on infinite loops", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor({ registry, timeout: 500, memoryLimit: 64 });

    const result = await executor.execute("while (true) {}");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timeout/i);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `cd packages/code-mode && npx vitest run src/__tests__/vm-sandbox.test.ts`
Expected: FAIL

**Step 4: Implement vm-sandbox.ts**

Note: `isolated-vm` may have compatibility issues with some setups. If it does, we fall back to a simpler Node `vm` module approach. The implementation should try `isolated-vm` first, and if it's not available, use Node's built-in `vm` with `vm.createContext` + `vm.runInContext` (less isolated but functional).

```typescript
import { createBridgeHandler, generateHarnessCode } from "./bridge.js";
import type { CodeModeResult, CodeModeExecutor } from "./executor.js";
import type { ToolRegistry } from "@augure/tools";
import { transform } from "esbuild";

export interface VmExecutorConfig {
  registry: ToolRegistry;
  timeout: number;
  memoryLimit: number;
}

export class VmExecutor implements CodeModeExecutor {
  private readonly config: VmExecutorConfig;

  constructor(config: VmExecutorConfig) {
    this.config = config;
  }

  async execute(code: string): Promise<CodeModeResult> {
    const start = Date.now();
    const bridge = createBridgeHandler(this.config.registry);

    const harnessTs = generateHarnessCode(code);

    // Transpile TS to JS
    let harnessJs: string;
    try {
      const result = await transform(harnessTs, {
        loader: "ts",
        target: "es2024",
        format: "esm",
      });
      harnessJs = result.code;
    } catch (err) {
      return {
        success: false,
        output: undefined,
        logs: [],
        error: `Transpile error: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
        toolCalls: 0,
      };
    }

    // Execute in Node vm context
    try {
      const { createContext, runInContext } = await import("node:vm");

      let capturedOutput = "";
      const fakeConsole = {
        log: (...args: unknown[]) => { capturedOutput += args.map(String).join(" ") + "\n"; },
      };

      const context = createContext({
        console: fakeConsole,
        __bridge: bridge,
        setTimeout,
        JSON,
        String,
        Number,
        Boolean,
        Array,
        Object,
        Error,
        Promise,
        Map,
        Set,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
      });

      // Wrap in async IIFE so we can use top-level await
      const wrappedCode = `(async () => { ${harnessJs} })()`;

      const promise = runInContext(wrappedCode, context, {
        timeout: this.config.timeout,
      });

      await promise;

      // Parse the captured JSON output from harness
      const lines = capturedOutput.trim().split("\n");
      const lastLine = lines[lines.length - 1];

      try {
        const parsed = JSON.parse(lastLine) as {
          success: boolean;
          output?: unknown;
          error?: string;
          logs?: string[];
          toolCalls?: number;
        };
        return {
          success: parsed.success,
          output: parsed.output,
          logs: parsed.logs ?? [],
          error: parsed.error,
          durationMs: Date.now() - start,
          toolCalls: parsed.toolCalls ?? 0,
        };
      } catch {
        return {
          success: true,
          output: capturedOutput.trim(),
          logs: [],
          durationMs: Date.now() - start,
          toolCalls: 0,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes("Script execution timed out");
      return {
        success: false,
        output: undefined,
        logs: [],
        error: isTimeout ? "Timeout: code execution exceeded time limit" : message,
        durationMs: Date.now() - start,
        toolCalls: 0,
      };
    }
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/code-mode && npx vitest run src/__tests__/vm-sandbox.test.ts`
Expected: PASS (or adjust based on Node vm behavior)

**Step 6: Export from index.ts**

Add to `packages/code-mode/src/index.ts`:
```typescript
export type { CodeModeResult, CodeModeExecutor } from "./executor.js";
export { VmExecutor } from "./vm-sandbox.js";
export type { VmExecutorConfig } from "./vm-sandbox.js";
```

**Step 7: Commit**

```bash
git add packages/code-mode/src/executor.ts packages/code-mode/src/vm-sandbox.ts packages/code-mode/src/__tests__/vm-sandbox.test.ts packages/code-mode/src/index.ts
git commit -m "feat(code-mode): implement VM executor with Node vm sandbox"
```

---

### Task 5: Implement Docker executor — container sandbox with HTTP bridge

**Files:**
- Create: `packages/code-mode/src/docker-sandbox.ts`
- Create: `packages/code-mode/src/__tests__/docker-sandbox.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerExecutor } from "../docker-sandbox.js";
import type { Container, ContainerPool, ToolContext } from "@augure/types";
import { ToolRegistry } from "@augure/tools";

function mockContainer(execResults: Array<{ stdout: string; stderr: string; exitCode: number }>): Container {
  let callIndex = 0;
  return {
    exec: vi.fn(async () => {
      const result = execResults[callIndex] ?? { stdout: "", stderr: "", exitCode: 0 };
      callIndex++;
      return result;
    }),
    id: "test-container",
  } as unknown as Container;
}

function mockPool(container: Container): ContainerPool {
  return {
    acquire: vi.fn(async () => container),
    release: vi.fn(async () => {}),
    destroyAll: vi.fn(async () => {}),
  } as unknown as ContainerPool;
}

function makeRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register({
    name: "echo",
    description: "echo tool",
    parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
    execute: async (params: unknown) => ({ success: true, output: `echo: ${JSON.stringify(params)}` }),
  });
  r.setContext({} as ToolContext);
  return r;
}

describe("DockerExecutor", () => {
  it("writes harness and code to container then executes", async () => {
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir
      { stdout: "", stderr: "", exitCode: 0 }, // write code
      { stdout: "", stderr: "", exitCode: 0 }, // write harness
      { stdout: JSON.stringify({ success: true, output: "hello", logs: [], toolCalls: 0 }), stderr: "", exitCode: 0 },
    ]);
    const pool = mockPool(container);
    const registry = makeRegistry();

    const executor = new DockerExecutor({
      registry,
      pool,
      timeout: 30,
      memoryLimit: "256m",
      cpuLimit: "1",
    });

    const result = await executor.execute('return "hello";');

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello");
    expect(pool.acquire).toHaveBeenCalled();
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("returns error when container exec fails", async () => {
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "SyntaxError: unexpected", exitCode: 1 },
    ]);
    const pool = mockPool(container);
    const registry = makeRegistry();

    const executor = new DockerExecutor({ registry, pool, timeout: 30, memoryLimit: "256m", cpuLimit: "1" });

    const result = await executor.execute("invalid code {{");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("releases container even on failure", async () => {
    const container = mockContainer([
      { stdout: "", stderr: "fail", exitCode: 1 },
    ]);
    const pool = mockPool(container);
    const registry = makeRegistry();

    const executor = new DockerExecutor({ registry, pool, timeout: 30, memoryLimit: "256m", cpuLimit: "1" });

    await executor.execute("return 1;");

    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("returns error when pool acquire fails", async () => {
    const pool = {
      acquire: vi.fn(async () => { throw new Error("pool exhausted"); }),
      release: vi.fn(async () => {}),
      destroyAll: vi.fn(async () => {}),
    } as unknown as ContainerPool;
    const registry = makeRegistry();

    const executor = new DockerExecutor({ registry, pool, timeout: 30, memoryLimit: "256m", cpuLimit: "1" });

    const result = await executor.execute("return 1;");

    expect(result.success).toBe(false);
    expect(result.error).toContain("pool exhausted");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/code-mode && npx vitest run src/__tests__/docker-sandbox.test.ts`
Expected: FAIL

**Step 3: Implement docker-sandbox.ts**

```typescript
import type { ContainerPool, Container } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import { generateHarnessCode } from "./bridge.js";
import type { CodeModeResult, CodeModeExecutor } from "./executor.js";

export interface DockerExecutorConfig {
  registry: ToolRegistry;
  pool: ContainerPool;
  timeout: number;
  memoryLimit: string;
  cpuLimit: string;
}

// Docker harness includes an HTTP bridge client that calls back to the host.
// For v1, we use a simplified approach: the harness runs the code directly
// with tool calls handled via the same stdout JSON protocol as skills.
// The bridge calls are serialized as requests in the output.
const DOCKER_HARNESS_TEMPLATE = `
import { readFile } from "node:fs/promises";

const __logs = [];
const __originalLog = console.log;
console.log = (...args) => __logs.push(args.map(String).join(" "));
console.warn = (...args) => __logs.push("[warn] " + args.map(String).join(" "));
console.error = (...args) => __logs.push("[error] " + args.map(String).join(" "));

let __toolCalls = 0;

// In Docker mode, tool calls are not supported in v1 (no HTTP bridge yet).
// The code can only do computation and return results.
// Tool bridge will be added in a follow-up task.
const api = new Proxy({}, {
  get: (_target, toolName) => {
    return async () => {
      __toolCalls++;
      return { success: false, output: "Tool calls not yet supported in Docker executor" };
    };
  }
});

const __userCode = await readFile("/workspace/user-code.js", "utf-8");
const __fn = new Function("api", "console", "__logs", "__toolCalls",
  "return (async () => { " + __userCode + " })();"
);

try {
  const __result = await __fn(api, console, __logs, __toolCalls);
  __originalLog(JSON.stringify({
    success: true,
    output: __result,
    logs: __logs,
    toolCalls: __toolCalls,
  }));
} catch (err) {
  __originalLog(JSON.stringify({
    success: false,
    error: err.message ?? String(err),
    logs: __logs,
    toolCalls: __toolCalls,
  }));
}
`;

export class DockerExecutor implements CodeModeExecutor {
  private readonly config: DockerExecutorConfig;

  constructor(config: DockerExecutorConfig) {
    this.config = config;
  }

  async execute(code: string): Promise<CodeModeResult> {
    const start = Date.now();

    let container: Container;
    try {
      container = await this.config.pool.acquire({
        trust: "sandboxed",
        timeout: this.config.timeout,
        memory: this.config.memoryLimit,
        cpu: this.config.cpuLimit,
      });
    } catch (err) {
      return {
        success: false,
        output: undefined,
        logs: [],
        error: `Failed to acquire container: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
        toolCalls: 0,
      };
    }

    try {
      // Write files to container
      await container.exec("mkdir -p /workspace");

      const codeB64 = Buffer.from(code).toString("base64");
      await container.exec(`sh -c 'echo "${codeB64}" | base64 -d > /workspace/user-code.js'`);

      const harnessB64 = Buffer.from(DOCKER_HARNESS_TEMPLATE).toString("base64");
      await container.exec(`sh -c 'echo "${harnessB64}" | base64 -d > /workspace/harness.ts'`);

      // Execute
      const execResult = await container.exec("npx tsx /workspace/harness.ts", {
        timeout: this.config.timeout,
        cwd: "/workspace",
      });

      // Parse result
      if (execResult.exitCode === 0 && execResult.stdout.trim()) {
        try {
          const lastLine = execResult.stdout.trim().split("\n").pop()!;
          const parsed = JSON.parse(lastLine) as {
            success: boolean;
            output?: unknown;
            error?: string;
            logs?: string[];
            toolCalls?: number;
          };
          return {
            success: parsed.success,
            output: parsed.output,
            logs: parsed.logs ?? [],
            error: parsed.error,
            durationMs: Date.now() - start,
            toolCalls: parsed.toolCalls ?? 0,
          };
        } catch {
          return {
            success: true,
            output: execResult.stdout.trim(),
            logs: [],
            durationMs: Date.now() - start,
            toolCalls: 0,
          };
        }
      }

      return {
        success: false,
        output: undefined,
        logs: [],
        error: execResult.stderr || execResult.stdout || "Unknown error",
        durationMs: Date.now() - start,
        toolCalls: 0,
      };
    } catch (err) {
      return {
        success: false,
        output: undefined,
        logs: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        toolCalls: 0,
      };
    } finally {
      await this.config.pool.release(container);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/code-mode && npx vitest run src/__tests__/docker-sandbox.test.ts`
Expected: PASS

**Step 5: Export from index.ts**

Add to `packages/code-mode/src/index.ts`:
```typescript
export { DockerExecutor } from "./docker-sandbox.js";
export type { DockerExecutorConfig } from "./docker-sandbox.js";
```

**Step 6: Commit**

```bash
git add packages/code-mode/src/docker-sandbox.ts packages/code-mode/src/__tests__/docker-sandbox.test.ts packages/code-mode/src/index.ts
git commit -m "feat(code-mode): implement Docker executor with container sandbox"
```

---

### Task 6: Implement the `execute_code` tool and auto-fallback executor

**Files:**
- Create: `packages/code-mode/src/tool.ts`
- Create: `packages/code-mode/src/auto-executor.ts`
- Create: `packages/code-mode/src/__tests__/tool.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { createCodeModeTool } from "../tool.js";
import { AutoExecutor } from "../auto-executor.js";
import type { CodeModeExecutor, CodeModeResult } from "../executor.js";
import type { NativeTool, ToolContext } from "@augure/types";
import { ToolRegistry } from "@augure/tools";

function makeRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register({
    name: "echo",
    description: "echo tool",
    parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
    execute: async () => ({ success: true, output: "ok" }),
  });
  r.setContext({} as ToolContext);
  return r;
}

function mockExecutor(result: Partial<CodeModeResult>): CodeModeExecutor {
  return {
    execute: vi.fn(async () => ({
      success: true,
      output: "test",
      logs: [],
      durationMs: 10,
      toolCalls: 0,
      ...result,
    })),
  };
}

describe("createCodeModeTool", () => {
  it("creates a NativeTool with name execute_code", () => {
    const registry = makeRegistry();
    const executor = mockExecutor({});
    const tool = createCodeModeTool(registry, executor);

    expect(tool.name).toBe("execute_code");
    expect(tool.parameters.required).toContain("code");
  });

  it("executes code via the executor and returns ToolResult", async () => {
    const registry = makeRegistry();
    const executor = mockExecutor({ success: true, output: "hello" });
    const tool = createCodeModeTool(registry, executor);

    const result = await tool.execute({ code: "return 42;" }, {} as ToolContext);

    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
    expect(executor.execute).toHaveBeenCalledWith("return 42;");
  });

  it("returns failure when executor fails", async () => {
    const registry = makeRegistry();
    const executor = mockExecutor({ success: false, error: "boom" });
    const tool = createCodeModeTool(registry, executor);

    const result = await tool.execute({ code: "bad code" }, {} as ToolContext);

    expect(result.success).toBe(false);
    expect(result.output).toContain("boom");
  });
});

describe("AutoExecutor", () => {
  it("uses primary executor when it succeeds", async () => {
    const primary = mockExecutor({ success: true, output: "primary" });
    const fallback = mockExecutor({ success: true, output: "fallback" });
    const auto = new AutoExecutor(primary, fallback);

    const result = await auto.execute("return 1;");

    expect(result.output).toBe("primary");
    expect(primary.execute).toHaveBeenCalled();
    expect(fallback.execute).not.toHaveBeenCalled();
  });

  it("falls back when primary throws", async () => {
    const primary: CodeModeExecutor = {
      execute: vi.fn(async () => { throw new Error("vm crashed"); }),
    };
    const fallback = mockExecutor({ success: true, output: "fallback" });
    const auto = new AutoExecutor(primary, fallback);

    const result = await auto.execute("return 1;");

    expect(result.output).toBe("fallback");
    expect(fallback.execute).toHaveBeenCalled();
  });

  it("falls back when primary returns with transpile error", async () => {
    const primary = mockExecutor({ success: false, error: "Transpile error: something" });
    const fallback = mockExecutor({ success: true, output: "fallback" });
    const auto = new AutoExecutor(primary, fallback);

    const result = await auto.execute("return 1;");

    // Transpile errors should NOT fall back (same code would fail in Docker too)
    expect(result.success).toBe(false);
    expect(result.error).toContain("Transpile");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/code-mode && npx vitest run src/__tests__/tool.test.ts`
Expected: FAIL

**Step 3: Implement auto-executor.ts**

```typescript
import type { CodeModeResult, CodeModeExecutor } from "./executor.js";

export class AutoExecutor implements CodeModeExecutor {
  constructor(
    private readonly primary: CodeModeExecutor,
    private readonly fallback: CodeModeExecutor,
  ) {}

  async execute(code: string): Promise<CodeModeResult> {
    try {
      const result = await this.primary.execute(code);
      // Don't fall back for transpile errors (same code would fail anywhere)
      if (!result.success && result.error?.startsWith("Transpile error")) {
        return result;
      }
      // Don't fall back for normal code errors (user code bugs)
      return result;
    } catch {
      // Primary executor itself crashed — fall back to Docker
      return this.fallback.execute(code);
    }
  }
}
```

**Step 4: Implement tool.ts**

```typescript
import type { NativeTool } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import type { CodeModeExecutor } from "./executor.js";
import { generateDeclarations } from "./typegen.js";

export function createCodeModeTool(
  registry: ToolRegistry,
  executor: CodeModeExecutor,
): NativeTool {
  const declarations = generateDeclarations(registry);

  return {
    name: "execute_code",
    description: `Execute TypeScript code with access to the agent's APIs. Write the body of an async function.

Available APIs:

\`\`\`typescript
${declarations}
\`\`\`

Each API call returns { success: boolean, output: string }.
Use console.log() for intermediate output. Return your final result.`,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The body of an async TypeScript function. Use the 'api' object to call tools.",
        },
      },
      required: ["code"],
    },
    execute: async (params) => {
      const { code } = params as { code: string };
      const result = await executor.execute(code);

      if (result.success) {
        const parts: string[] = [];
        if (result.logs.length > 0) {
          parts.push(`[logs]\n${result.logs.join("\n")}`);
        }
        parts.push(typeof result.output === "string" ? result.output : JSON.stringify(result.output));
        return { success: true, output: parts.join("\n\n") };
      }

      return {
        success: false,
        output: result.error ?? "Code execution failed",
      };
    },
  };
}
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/code-mode && npx vitest run src/__tests__/tool.test.ts`
Expected: PASS

**Step 6: Export from index.ts**

Add to `packages/code-mode/src/index.ts`:
```typescript
export { createCodeModeTool } from "./tool.js";
export { AutoExecutor } from "./auto-executor.js";
```

**Step 7: Commit**

```bash
git add packages/code-mode/src/tool.ts packages/code-mode/src/auto-executor.ts packages/code-mode/src/__tests__/tool.test.ts packages/code-mode/src/index.ts
git commit -m "feat(code-mode): implement execute_code tool and auto-fallback executor"
```

---

### Task 7: Wire code mode into @augure/core

**Files:**
- Modify: `packages/types/src/config.ts` — add `CodeModeConfig` interface
- Modify: `packages/core/src/config.ts` — add `codeMode` to Zod schema
- Modify: `packages/core/src/main.ts` — wire code mode executor, replace tool schemas
- Modify: `packages/core/src/agent.ts` — update system prompt injection
- Modify: `packages/core/package.json` — add `@augure/code-mode` dependency
- Modify: `packages/core/tsconfig.json` — add code-mode reference

**Step 1: Add CodeModeConfig to types**

In `packages/types/src/config.ts`, add after `UpdatesConfig`:

```typescript
export interface CodeModeConfig {
  runtime: "vm" | "docker" | "auto";
  timeout: number;
  memoryLimit: number;
}
```

And add to `AppConfig` in `packages/types/src/tools.ts`:

```typescript
// Add to AppConfig interface:
codeMode?: CodeModeConfig;
```

**Step 2: Add codeMode to Zod schema in core/config.ts**

In `packages/core/src/config.ts`, add to `AppConfigSchema` (after `updates`):

```typescript
codeMode: z
  .object({
    runtime: z.enum(["vm", "docker", "auto"]).default("auto"),
    timeout: z.number().int().positive().default(30),
    memoryLimit: z.number().int().positive().default(128),
  })
  .optional(),
```

**Step 3: Add @augure/code-mode dependency to core**

In `packages/core/package.json`, add to `dependencies`:
```json
"@augure/code-mode": "workspace:*"
```

In `packages/core/tsconfig.json`, add to `references`:
```json
{ "path": "../code-mode" }
```

**Step 4: Wire code mode in main.ts**

In `packages/core/src/main.ts`:

Add import:
```typescript
import {
  createCodeModeTool,
  VmExecutor,
  DockerExecutor,
  AutoExecutor,
} from "@augure/code-mode";
```

After `tools.setContext(...)` (line 236) and before the agent creation, add:

```typescript
// Code Mode setup
let codeModeExecutor: import("@augure/code-mode").CodeModeExecutor | undefined;
if (config.codeMode) {
  const cmConfig = config.codeMode;
  const vmExec = new VmExecutor({
    registry: tools,
    timeout: cmConfig.timeout * 1000,
    memoryLimit: cmConfig.memoryLimit,
  });

  if (cmConfig.runtime === "vm") {
    codeModeExecutor = vmExec;
  } else if (cmConfig.runtime === "docker") {
    codeModeExecutor = new DockerExecutor({
      registry: tools,
      pool,
      timeout: cmConfig.timeout,
      memoryLimit: config.sandbox.defaults.memoryLimit,
      cpuLimit: config.sandbox.defaults.cpuLimit,
    });
  } else {
    // "auto" — VM with Docker fallback
    const dockerExec = new DockerExecutor({
      registry: tools,
      pool,
      timeout: cmConfig.timeout,
      memoryLimit: config.sandbox.defaults.memoryLimit,
      cpuLimit: config.sandbox.defaults.cpuLimit,
    });
    codeModeExecutor = new AutoExecutor(vmExec, dockerExec);
  }

  log.info(`Code Mode enabled: runtime=${cmConfig.runtime}, timeout=${cmConfig.timeout}s`);
}
```

Then modify the Agent creation to pass code mode executor. Add to `AgentConfig` interface in `agent.ts`:

```typescript
codeModeExecutor?: import("@augure/code-mode").CodeModeExecutor;
```

And in `main.ts` agent creation:

```typescript
const agent = new Agent({
  llm,
  tools,
  systemPrompt,
  memoryContent: "",
  retriever,
  ingester,
  audit,
  guard,
  modelName: config.llm.default.model,
  logger: log.child("agent"),
  codeModeExecutor,  // <-- NEW
});
```

**Step 5: Update Agent to use code mode when available**

In `packages/core/src/agent.ts`, modify `handleMessage`:

```typescript
// At the top of handleMessage, after toolSchemas:
let effectiveSchemas = toolSchemas;
let codeModeTool: NativeTool | undefined;

if (this.config.codeModeExecutor) {
  const { createCodeModeTool } = await import("@augure/code-mode");
  codeModeTool = createCodeModeTool(this.config.tools, this.config.codeModeExecutor);
  effectiveSchemas = [{
    type: "function" as const,
    function: {
      name: codeModeTool.name,
      description: codeModeTool.description,
      parameters: codeModeTool.parameters,
    },
  }];
}
```

Then use `effectiveSchemas` in the llm.chat call, and dispatch to `codeModeTool.execute()` when the tool call name is `execute_code`.

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 7: Run existing tests**

Run: `pnpm test`
Expected: all existing tests still pass

**Step 8: Commit**

```bash
git add packages/types/src/config.ts packages/types/src/tools.ts packages/core/src/config.ts packages/core/src/main.ts packages/core/src/agent.ts packages/core/package.json packages/core/tsconfig.json
git commit -m "feat(core): wire code mode into agent loop with configurable runtime"
```

---

### Task 8: Add config documentation and integration test

**Files:**
- Create: `packages/code-mode/src/__tests__/integration.test.ts`
- Modify: `packages/core/src/__tests__/agent.test.ts` — add code mode test case

**Step 1: Write integration test for code-mode package**

```typescript
import { describe, it, expect } from "vitest";
import { ToolRegistry } from "@augure/tools";
import type { ToolContext } from "@augure/types";
import { generateDeclarations, createCodeModeTool, VmExecutor } from "../index.js";

describe("code-mode integration", () => {
  function makeRegistry(): ToolRegistry {
    const r = new ToolRegistry();
    r.register({
      name: "memory_read",
      description: "Read a memory file",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path" } },
        required: ["path"],
      },
      execute: async (params) => {
        const { path } = params as { path: string };
        return { success: true, output: `content of ${path}` };
      },
    });
    r.register({
      name: "memory_write",
      description: "Write a memory file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
      execute: async (params) => {
        const { path, content } = params as { path: string; content: string };
        return { success: true, output: `wrote ${content.length} chars to ${path}` };
      },
    });
    r.setContext({} as ToolContext);
    return r;
  }

  it("generates declarations for all registered tools", () => {
    const registry = makeRegistry();
    const decl = generateDeclarations(registry);

    expect(decl).toContain("memory_read");
    expect(decl).toContain("memory_write");
    expect(decl).toContain("MemoryReadInput");
    expect(decl).toContain("MemoryWriteInput");
  });

  it("full flow: generate tool → execute code that calls tools", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor({ registry, timeout: 5000, memoryLimit: 64 });
    const tool = createCodeModeTool(registry, executor);

    const result = await tool.execute(
      { code: 'const r = await api.memory_read({ path: "test.md" }); return r.output;' },
      {} as ToolContext,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("content of test.md");
  });

  it("full flow: multi-step code with multiple tool calls", async () => {
    const registry = makeRegistry();
    const executor = new VmExecutor({ registry, timeout: 5000, memoryLimit: 64 });
    const tool = createCodeModeTool(registry, executor);

    const result = await tool.execute(
      {
        code: `
          const data = await api.memory_read({ path: "notes.md" });
          await api.memory_write({ path: "copy.md", content: data.output });
          return "copied";
        `,
      },
      {} as ToolContext,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("copied");
  });
});
```

**Step 2: Run integration test**

Run: `cd packages/code-mode && npx vitest run src/__tests__/integration.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: all tests PASS

**Step 4: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/code-mode/src/__tests__/integration.test.ts
git commit -m "test(code-mode): add integration test for full typegen → execute flow"
```

---

### Task 9: Final cleanup and exports

**Files:**
- Modify: `packages/code-mode/src/index.ts` — ensure all exports are complete
- Modify: `packages/cli/tsconfig.json` — add code-mode reference if needed

**Step 1: Verify final index.ts**

Ensure `packages/code-mode/src/index.ts` has:

```typescript
export { generateDeclarations, sanitizeName } from "./typegen.js";
export { createBridgeHandler, generateHarnessCode } from "./bridge.js";
export type { BridgeHandler } from "./bridge.js";
export type { CodeModeResult, CodeModeExecutor } from "./executor.js";
export { VmExecutor } from "./vm-sandbox.js";
export type { VmExecutorConfig } from "./vm-sandbox.js";
export { DockerExecutor } from "./docker-sandbox.js";
export type { DockerExecutorConfig } from "./docker-sandbox.js";
export { createCodeModeTool } from "./tool.js";
export { AutoExecutor } from "./auto-executor.js";
```

**Step 2: Build everything**

Run: `pnpm build`
Expected: all packages build successfully

**Step 3: Run full suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(code-mode): complete code mode implementation"
```
