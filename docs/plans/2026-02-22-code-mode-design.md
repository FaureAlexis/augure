# Code Mode Design

**Date**: 2026-02-22
**Status**: Approved
**Inspired by**: [Cloudflare Code Mode](https://blog.cloudflare.com/code-mode/)

## Summary

Replace the classic tool-calling loop with a single `execute_code` tool. The LLM generates TypeScript code that calls typed APIs (auto-generated from the ToolRegistry) and executes in an isolated sandbox. This reduces LLM round-trips for multi-step tasks and improves composition quality since LLMs are better at writing TypeScript than at producing function-calling tokens.

## Goals

1. **Reduce round-trips**: multi-step operations execute in a single code block instead of N sequential tool calls
2. **Increase capacity**: the LLM composes complex workflows (fetch -> transform -> store -> schedule) in one pass
3. **Extensibility**: any tool registered in the ToolRegistry is automatically available as a typed API

## Architecture

### New Package: `@augure/code-mode`

```
packages/
  code-mode/
    src/
      typegen.ts          # Generate .d.ts from ToolRegistry
      executor.ts         # Orchestrate execution (VM or Docker)
      vm-sandbox.ts       # Execution via isolated-vm (fast, default)
      docker-sandbox.ts   # Execution via Docker container (powerful)
      bridge.ts           # Proxy routing API calls to host ToolRegistry
      tool.ts             # The "execute_code" NativeTool
      index.ts
```

### Dependency Graph

```
@augure/types
    |
    +-- @augure/tools        (ToolRegistry, NativeTool)
    +-- @augure/sandbox      (ContainerPool, for Docker mode)
    |
    +-- @augure/code-mode    <-- NEW, depends on tools + sandbox + types
            |
            +-- @augure/core (Agent uses code-mode instead of direct tool loop)
```

## Component Details

### 1. Typegen (`typegen.ts`)

Converts the ToolRegistry into TypeScript declarations injected into the system prompt.

**Input**: `ToolRegistry.list()` (array of `NativeTool`)

**Output**: TypeScript declaration string:

```typescript
interface MemoryReadInput { path: string }
interface MemoryWriteInput { path: string; content: string }
interface ScheduleInput { name: string; cron?: string; runAt?: string; action: string }
// ... auto-generated for each registered tool

declare const api: {
  /** Read a file from the agent's persistent memory store. */
  memory_read: (input: MemoryReadInput) => Promise<{ success: boolean; output: string }>;
  /** Write content to the agent's persistent memory store. */
  memory_write: (input: MemoryWriteInput) => Promise<{ success: boolean; output: string }>;
  /** Schedule a job (cron or one-shot). */
  schedule: (input: ScheduleInput) => Promise<{ success: boolean; output: string }>;
  // ... all tools from registry, including skill tools
};
```

**Rules**:
- JSON Schema types map to TS: `string` -> `string`, `number` -> `number`, `boolean` -> `boolean`, `array` -> `unknown[]`, `object` -> `Record<string, unknown>`
- `required` fields are non-optional, others get `?`
- `description` fields become JSDoc comments
- Tool names sanitized: hyphens/dots replaced with underscores
- Return type: `Promise<{ success: boolean; output: string }>` (mirrors `ToolResult`)
- Regenerated at agent startup and after each `tools.register()`

### 2. Bridge (`bridge.ts`)

Routes API calls from the sandbox back to the host ToolRegistry.

**Sandbox side** (injected in harness):

```typescript
const api = new Proxy({}, {
  get: (_target, toolName: string) => {
    return async (input: unknown) => {
      return await __bridge.call(toolName, input);
    };
  }
});
```

**Host side**: receives calls and dispatches to `registry.execute(name, params)`.

**Communication by runtime**:

| Runtime | Mechanism |
|---------|-----------|
| Node VM (`isolated-vm`) | Injected callback References in isolate context |
| Docker | HTTP server on ephemeral port, bind-mounted into container |

### 3. Executor (`executor.ts`)

Orchestrates code execution. Two implementations share one interface:

```typescript
interface CodeModeResult {
  success: boolean;
  output: unknown;
  logs: string[];
  error?: string;
  durationMs: number;
  toolCalls: number;
}

interface CodeModeExecutor {
  execute(code: string, registry: ToolRegistry): Promise<CodeModeResult>;
}
```

**`VmExecutor`** (default, fast):
1. Transpile TS -> JS via `esbuild.transform()` (< 5ms)
2. Create `isolated-vm` Isolate with memory limit
3. Inject bridge (Proxy + callbacks to ToolRegistry)
4. Capture console.log via override
5. Execute with timeout
6. Return result + logs

**`DockerExecutor`** (powerful):
1. Generate full harness TS (LLM code + HTTP bridge client + API types)
2. Acquire container from pool
3. Start bridge HTTP server on host (ephemeral port, bind into container)
4. Write code + harness to container (base64, like SkillRunner)
5. Execute `npx tsx /workspace/harness.ts`
6. Harness makes API calls via HTTP to bridge server
7. Parse JSON result from stdout
8. Release container

**Runtime selection**: `"auto"` (default) tries VM first, falls back to Docker on failure. Also configurable as `"vm"` or `"docker"`.

### 4. Tool (`tool.ts`)

The single NativeTool registered in the ToolRegistry:

```typescript
{
  name: "execute_code",
  description: "Execute TypeScript code with access to the agent's APIs.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "TypeScript async arrow function body"
      }
    },
    required: ["code"]
  },
  execute: async (params, ctx) => { /* delegates to CodeModeExecutor */ }
}
```

## Agent Loop Integration

### Before (classic tool loop)

```
LLM -> toolCall(memory_read) -> result -> LLM -> toolCall(http) -> result -> LLM -> response
= 3 LLM round-trips
```

### After (code mode)

```
LLM -> execute_code(`
  const data = await api.memory_read({ path: "notes.md" });
  const resp = await api.http({ url: "...", body: data.output });
  await api.memory_write({ path: "summary.md", content: resp.output });
  return resp.output;
`) -> result -> LLM -> response
= 1 LLM round-trip
```

### System Prompt Change

Instead of listing tool schemas, inject TypeScript declarations:

```
You have access to a TypeScript API. Write async arrow functions to accomplish tasks.
Available APIs:

\`\`\`typescript
${typegen.generateDeclarations(registry)}
\`\`\`

Each API call returns { success: boolean, output: string }.
Use console.log() to output intermediate results.
Return your final result from the function.
```

### Agent Loop (minimal change)

The while loop structure stays identical. Only the content changes:
- `toolSchemas` = one schema (`execute_code`) instead of N
- Tool execution dispatches to `CodeModeExecutor` instead of `ToolRegistry` directly
- Audit logs the entire code block + number of internal API calls

## Configuration

```json5
// augure.json5
{
  codeMode: {
    runtime: "auto",      // "vm" | "docker" | "auto"
    timeout: 30,          // seconds
    memoryLimit: 128,     // MB (for VM isolate)
  }
}
```

## Relationship to Skills

Code Mode and Skills are **complementary**:
- **Code Mode**: ephemeral, per-turn code execution (replaces the tool loop)
- **Skills**: persistent, versioned, scheduled code units (saved, tested, self-healing)

Both use sandboxed execution but serve different purposes. No convergence planned for v1.

## Dependencies

New npm dependencies:
- `isolated-vm` — V8 isolate for the VM executor
- `esbuild` — TypeScript transpilation (already available via tsup/vitest)

## Error Handling

- **Timeout**: executor kills the sandbox after configured timeout, returns `{ success: false, error: "Timeout" }`
- **Runtime error**: caught by harness try/catch, returned as `{ success: false, error: message }`
- **Bridge failure**: if a tool call fails, the ToolResult `{ success: false }` propagates to the LLM code
- **VM failure + auto mode**: falls back to Docker executor, logs warning
