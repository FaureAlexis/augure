# Sandbox Docker — Design

**Date:** 2026-02-21
**Status:** Approved

## Goal

Implement the `@augure/sandbox` package: a Docker container pool that executes shell commands and code agent tasks in isolated containers. This unblocks M2 (Skills Engine) and M3 (Browser & Coding).

## Architecture

On-demand container pool with reuse, powered by dockerode. Containers are created when needed, cached after use, and destroyed when tainted or on shutdown.

### Container Pool

```typescript
interface ContainerPool {
  acquire(opts: ContainerOpts): Promise<Container>;
  release(container: Container): Promise<void>;
  destroy(container: Container): Promise<void>;
  destroyAll(): Promise<void>;
  stats(): PoolStats;
}

interface ContainerOpts {
  trust: "sandboxed" | "trusted";
  timeout: number;
  memory: string;
  cpu: string;
  env?: Record<string, string>;
  mounts?: VolumeMount[];
}

interface VolumeMount {
  host: string;
  container: string;
  readonly?: boolean;
}

interface PoolStats {
  idle: number;
  busy: number;
  total: number;
  maxTotal: number;
}
```

- `acquire()` checks idle cache first, creates new container if none available.
- `release()` returns container to idle cache if clean. Destroys if tainted.
- `maxTotal` from `config.security.maxConcurrentSandboxes` (default: 3).

### Trust Levels

| Level | Network | Filesystem | Use case |
|-------|---------|-----------|----------|
| `sandboxed` (default) | `--network none` | `/workspace` only | Web scraping, untrusted code, skills |
| `trusted` | Host network | Custom mounts allowed | Git repos, API access, code agent |

### Container Wrapper

```typescript
interface Container {
  id: string;
  exec(command: string, opts?: ExecOpts): Promise<ExecResult>;
  stop(): Promise<void>;
  status: "idle" | "busy" | "stopped";
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ExecOpts {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}
```

- `exec()` uses dockerode `container.exec()` with `AttachStdout/Stderr`.
- Timeout via `AbortController` — kills the exec process if exceeded.
- stdout/stderr captured as buffers, truncated to a configurable max size.

---

## Docker Image

Single universal image `augure-sandbox:latest`:

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip curl jq git gh ripgrep \
    && npx playwright install-deps chromium \
    && npx playwright install chromium \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
```

One image for all use cases. The container is universal — the code agent / shell / browser decides what to use at runtime.

---

## Native Tools

### `sandbox_exec`

Execute a shell command in an isolated container.

**LLM-facing parameters:**

```json
{
  "command": "string (required) — shell command to execute",
  "trust": "sandboxed | trusted (optional, default: sandboxed)",
  "timeout": "number (optional, seconds, default from config)"
}
```

**Output:** stdout + stderr, truncated. Exit code in status line.

### `opencode`

Bridge to a configurable code agent (claude-code, opencode, codex CLI) running in a container.

**LLM-facing parameters:**

```json
{
  "task": "string (required) — natural language task description",
  "trust": "sandboxed | trusted (optional, default: trusted)",
  "timeout": "number (optional, seconds, default from config)"
}
```

The agent command is configured in `config.sandbox.codeAgent`. The tool:
1. Acquires a `trusted` container
2. Injects `codeAgent.env` (API keys) as environment variables
3. Runs `codeAgent.command` with `codeAgent.args` + the task description
4. Streams stdout back, truncated to max output size
5. Releases the container

---

## Config Changes

### SandboxConfig update

```typescript
interface SandboxConfig {
  runtime: "docker";
  image?: string;                     // default: "augure-sandbox:latest"
  defaults: {
    timeout: number;                  // seconds
    memoryLimit: string;              // e.g. "512m"
    cpuLimit: string;                 // e.g. "1.0"
  };
  codeAgent?: {
    command: string;                  // "claude-code" | "opencode" | "codex"
    args?: string[];                  // extra CLI args
    env?: Record<string, string>;     // API keys injected into container
  };
}
```

### Zod schema update

Add `image` (optional string) and `codeAgent` (optional object with command, args, env) to the existing sandbox schema in `packages/core/src/config.ts`.

---

## ToolContext update

`ToolContext` needs a `pool: ContainerPool` field so sandbox tools can acquire containers:

```typescript
interface ToolContext {
  config: AppConfig;
  memory: MemoryStore;
  scheduler: Scheduler;
  pool: ContainerPool;              // NEW
}
```

---

## Testing Strategy

### Unit tests (mocked dockerode)

- Pool: acquire returns cached container, acquire creates new when cache empty, acquire respects maxTotal limit, release returns to cache, destroy removes container, destroyAll cleans everything.
- Container: exec runs command and returns stdout/stderr, exec respects timeout, exec handles non-zero exit code.
- Trust: sandboxed creates with `--network none`, trusted creates with host network.

### Integration tests (real Docker, skip if unavailable)

- Create real container from `node:22-slim`, exec a command, verify output.
- Verify network isolation for sandboxed containers.
- Verify timeout kills long-running processes.

### Tool tests (mocked pool)

- `sandbox_exec`: simple command, timeout, trust level forwarding.
- `opencode`: task execution, agent command assembly, env injection.
