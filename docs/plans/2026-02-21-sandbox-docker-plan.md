# Sandbox Docker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `@augure/sandbox` — a Docker container pool that executes shell commands and code agent tasks in isolated containers.

**Architecture:** On-demand container pool with reuse, powered by dockerode. Two native tools (`sandbox_exec`, `opencode`) acquire containers from the pool, run commands, and release them. Trust levels (`sandboxed` / `trusted`) control network and mount isolation.

**Tech Stack:** TypeScript, dockerode, vitest (mocked + integration), Zod 4

**Design doc:** `docs/plans/2026-02-21-sandbox-docker-design.md`

---

### Task 1: Add sandbox types to `@augure/types`

**Files:**
- Modify: `packages/types/src/config.ts`
- Modify: `packages/types/src/tools.ts`
- Create: `packages/types/src/sandbox.ts`
- Modify: `packages/types/src/index.ts`

**Step 1: Create `packages/types/src/sandbox.ts` with all sandbox interfaces**

```typescript
export interface ContainerOpts {
  trust: "sandboxed" | "trusted";
  timeout: number;
  memory: string;
  cpu: string;
  env?: Record<string, string>;
  mounts?: VolumeMount[];
}

export interface VolumeMount {
  host: string;
  container: string;
  readonly?: boolean;
}

export interface ExecOpts {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Container {
  id: string;
  exec(command: string, opts?: ExecOpts): Promise<ExecResult>;
  stop(): Promise<void>;
  status: "idle" | "busy" | "stopped";
}

export interface PoolStats {
  idle: number;
  busy: number;
  total: number;
  maxTotal: number;
}

export interface ContainerPool {
  acquire(opts: ContainerOpts): Promise<Container>;
  release(container: Container): Promise<void>;
  destroy(container: Container): Promise<void>;
  destroyAll(): Promise<void>;
  stats(): PoolStats;
}
```

**Step 2: Update `SandboxConfig` in `packages/types/src/config.ts`**

Add `image` and `codeAgent` fields to the existing `SandboxConfig`:

```typescript
export interface SandboxConfig {
  runtime: "docker";
  image?: string;
  defaults: {
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
  codeAgent?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
}
```

**Step 3: Add optional `pool` to `ToolContext` in `packages/types/src/tools.ts`**

```typescript
import type { ContainerPool } from "./sandbox.js";

export interface ToolContext {
  config: AppConfig;
  memory: MemoryStore;
  scheduler: Scheduler;
  pool?: ContainerPool;
}
```

`pool` is optional so existing tools don't need it.

**Step 4: Export from `packages/types/src/index.ts`**

Add `export * from "./sandbox.js";` line.

**Step 5: Run typecheck**

Run: `pnpm --filter @augure/types typecheck`
Expected: PASS (no consumers use the new fields yet)

**Step 6: Commit**

```bash
git add packages/types/src/sandbox.ts packages/types/src/config.ts packages/types/src/tools.ts packages/types/src/index.ts
git commit -m "feat(types): add sandbox interfaces (ContainerPool, Container, ExecResult)"
```

---

### Task 2: Update Zod schema for new sandbox config fields

**Files:**
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/__tests__/config.test.ts`

**Step 1: Write the failing test**

In `packages/core/src/__tests__/config.test.ts`, add a test that validates a config with `sandbox.image` and `sandbox.codeAgent`:

```typescript
it("should accept sandbox.image and sandbox.codeAgent", async () => {
  const cfg = makeConfig({
    sandbox: {
      runtime: "docker",
      image: "augure-sandbox:latest",
      defaults: { timeout: 30, memoryLimit: "512m", cpuLimit: "1.0" },
      codeAgent: {
        command: "claude-code",
        args: ["--no-interactive"],
        env: { ANTHROPIC_API_KEY: "sk-test" },
      },
    },
  });
  await writeConfig(cfg);
  const result = await loadConfig(tmpPath);
  expect(result.sandbox.image).toBe("augure-sandbox:latest");
  expect(result.sandbox.codeAgent?.command).toBe("claude-code");
  expect(result.sandbox.codeAgent?.args).toEqual(["--no-interactive"]);
  expect(result.sandbox.codeAgent?.env).toEqual({ ANTHROPIC_API_KEY: "sk-test" });
});
```

Note: check how `makeConfig` and `writeConfig` work in the existing test file. Adapt the helper usage accordingly.

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @augure/core test -- config`
Expected: FAIL — Zod rejects `image` and `codeAgent` as unknown keys.

**Step 3: Update Zod schema in `packages/core/src/config.ts`**

Change the `sandbox` section from:

```typescript
sandbox: z.object({
  runtime: z.literal("docker"),
  defaults: z.object({
    timeout: z.number().int().positive(),
    memoryLimit: z.string().min(1),
    cpuLimit: z.string().min(1),
  }),
}),
```

To:

```typescript
sandbox: z.object({
  runtime: z.literal("docker"),
  image: z.string().min(1).optional(),
  defaults: z.object({
    timeout: z.number().int().positive(),
    memoryLimit: z.string().min(1),
    cpuLimit: z.string().min(1),
  }),
  codeAgent: z
    .object({
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
}),
```

**Step 4: Run the test to verify it passes**

Run: `pnpm --filter @augure/core test -- config`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/config.ts packages/core/src/__tests__/config.test.ts
git commit -m "feat(core): add image and codeAgent to sandbox Zod schema"
```

---

### Task 3: Install dockerode and set up `@augure/sandbox` package

**Files:**
- Modify: `packages/sandbox/package.json`
- Modify: `packages/sandbox/tsconfig.json`

**Step 1: Install dockerode**

```bash
cd /Users/alexis/lab/augure
pnpm --filter @augure/sandbox add dockerode
pnpm --filter @augure/sandbox add -D @types/dockerode
```

**Step 2: Add `@augure/types` dependency to `packages/sandbox/package.json`**

Add `"@augure/types": "workspace:*"` to `dependencies`.

**Step 3: Add types reference to `packages/sandbox/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "references": [{ "path": "../types" }]
}
```

(Already has `../types` reference — verify and keep.)

**Step 4: Verify install works**

Run: `pnpm --filter @augure/sandbox typecheck`
Expected: PASS (still just the stub)

**Step 5: Commit**

```bash
git add packages/sandbox/package.json packages/sandbox/tsconfig.json pnpm-lock.yaml
git commit -m "chore(sandbox): add dockerode and @augure/types deps"
```

---

### Task 4: Implement Container wrapper

**Files:**
- Create: `packages/sandbox/src/container.ts`
- Create: `packages/sandbox/src/__tests__/container.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerContainer } from "../container.js";

function mockDockerContainer() {
  return {
    id: "abc123",
    exec: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function mockExecInstance(stdout: string, stderr: string, exitCode: number) {
  const stdoutStream = {
    on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
      if (event === "data") cb(Buffer.from(stdout));
      return stdoutStream;
    }),
  };
  const stderrStream = {
    on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
      if (event === "data") cb(Buffer.from(stderr));
      return stderrStream;
    }),
  };
  return {
    start: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({ ExitCode: exitCode }),
    output: { on: vi.fn() },
  };
}

describe("DockerContainer", () => {
  it("should expose the container id", () => {
    const raw = mockDockerContainer();
    const container = new DockerContainer(raw as any);
    expect(container.id).toBe("abc123");
    expect(container.status).toBe("idle");
  });

  it("should exec a command and return stdout/stderr", async () => {
    // Test that exec calls dockerode container.exec with correct args
    // and returns { exitCode, stdout, stderr }
  });

  it("should set status to busy during exec", async () => {
    // Test status transitions: idle -> busy -> idle
  });

  it("should respect timeout and kill process", async () => {
    // Test that a long-running exec is killed after timeout
  });

  it("should stop the container", async () => {
    const raw = mockDockerContainer();
    const container = new DockerContainer(raw as any);
    await container.stop();
    expect(container.status).toBe("stopped");
    expect(raw.stop).toHaveBeenCalled();
    expect(raw.remove).toHaveBeenCalled();
  });
});
```

Note: The exact mock structure for dockerode exec is tricky. The implementer should study dockerode's `container.exec()` API to mock it correctly. The key contract:
- `container.exec({ Cmd, AttachStdout, AttachStderr })` returns an exec instance
- `exec.start()` returns a demux stream
- Use `dockerode.Modem.demuxStream(stream, stdout, stderr)` to split
- `exec.inspect()` returns `{ ExitCode }`

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @augure/sandbox test`
Expected: FAIL — `DockerContainer` doesn't exist.

**Step 3: Implement `packages/sandbox/src/container.ts`**

```typescript
import type Dockerode from "dockerode";
import type { Container as IContainer, ExecResult, ExecOpts } from "@augure/types";
import { PassThrough } from "node:stream";

const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

export class DockerContainer implements IContainer {
  readonly id: string;
  status: "idle" | "busy" | "stopped" = "idle";

  constructor(private readonly raw: Dockerode.Container) {
    this.id = raw.id;
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    if (this.status === "stopped") throw new Error("Container is stopped");
    this.status = "busy";
    try {
      const exec = await this.raw.exec({
        Cmd: ["sh", "-c", command],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: opts?.cwd ?? "/workspace",
        Env: opts?.env
          ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`)
          : undefined,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      const stdout = new PassThrough();
      const stderr = new PassThrough();

      // dockerode provides demuxStream on the Modem
      const Docker = (await import("dockerode")).default;
      (Docker as any).prototype.modem.demuxStream(stream, stdout, stderr);

      const timeout = opts?.timeout ?? 30;
      const result = await Promise.race([
        this.collectOutput(exec, stdout, stderr),
        this.timeoutReject(timeout, stream),
      ]);

      return result;
    } finally {
      if (this.status !== "stopped") this.status = "idle";
    }
  }

  private async collectOutput(
    exec: any,
    stdout: PassThrough,
    stderr: PassThrough,
  ): Promise<ExecResult> {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;

    stdout.on("data", (chunk: Buffer) => {
      if (stdoutLen < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLen += chunk.length;
      }
    });
    stderr.on("data", (chunk: Buffer) => {
      if (stderrLen < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLen += chunk.length;
      }
    });

    await new Promise<void>((resolve) => {
      stdout.on("end", resolve);
    });

    const info = await exec.inspect();
    return {
      exitCode: info.ExitCode,
      stdout: Buffer.concat(stdoutChunks).toString("utf-8").slice(0, MAX_OUTPUT_BYTES),
      stderr: Buffer.concat(stderrChunks).toString("utf-8").slice(0, MAX_OUTPUT_BYTES),
    };
  }

  private timeoutReject(seconds: number, stream: NodeJS.ReadableStream): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        stream.destroy();
        reject(new Error(`Exec timed out after ${seconds}s`));
      }, seconds * 1000);
    });
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    try {
      await this.raw.stop({ t: 5 });
    } catch {
      // container may already be stopped
    }
    await this.raw.remove({ force: true });
  }
}
```

Note: The demux approach above is approximate. The implementer should check dockerode docs for the correct demux pattern. An alternative is reading the multiplexed stream header (8-byte frames) manually. Adjust the implementation to whatever approach works with the installed dockerode version.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @augure/sandbox test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sandbox/src/container.ts packages/sandbox/src/__tests__/container.test.ts
git commit -m "feat(sandbox): implement DockerContainer wrapper"
```

---

### Task 5: Implement ContainerPool

**Files:**
- Create: `packages/sandbox/src/pool.ts`
- Create: `packages/sandbox/src/__tests__/pool.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerContainerPool } from "../pool.js";

function mockDocker() {
  return {
    createContainer: vi.fn().mockResolvedValue({
      id: `container-${Math.random().toString(36).slice(2, 8)}`,
      start: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe("DockerContainerPool", () => {
  it("should create a new container when cache is empty", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, {
      image: "node:22-slim",
      maxTotal: 3,
    });
    const container = await pool.acquire({
      trust: "sandboxed",
      timeout: 30,
      memory: "512m",
      cpu: "1.0",
    });
    expect(container).toBeDefined();
    expect(container.id).toBeDefined();
    expect(pool.stats().busy).toBe(1);
    expect(pool.stats().idle).toBe(0);
    expect(docker.createContainer).toHaveBeenCalledOnce();
  });

  it("should return cached container on second acquire after release", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, {
      image: "node:22-slim",
      maxTotal: 3,
    });
    const c1 = await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });
    await pool.release(c1);
    expect(pool.stats().idle).toBe(1);

    const c2 = await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });
    expect(c2.id).toBe(c1.id);
    expect(docker.createContainer).toHaveBeenCalledOnce(); // no second create
  });

  it("should respect maxTotal limit", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, {
      image: "node:22-slim",
      maxTotal: 2,
    });
    await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });
    await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });

    await expect(
      pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" }),
    ).rejects.toThrow("Pool limit reached");
  });

  it("should create sandboxed container with --network none", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, { image: "node:22-slim", maxTotal: 3 });
    await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        NetworkDisabled: true,
      }),
    );
  });

  it("should create trusted container with host network", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, { image: "node:22-slim", maxTotal: 3 });
    await pool.acquire({ trust: "trusted", timeout: 30, memory: "512m", cpu: "1.0" });

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        NetworkDisabled: false,
        HostConfig: expect.objectContaining({
          NetworkMode: "host",
        }),
      }),
    );
  });

  it("should destroy a container", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, { image: "node:22-slim", maxTotal: 3 });
    const c = await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });
    await pool.destroy(c);
    expect(pool.stats().total).toBe(0);
  });

  it("should destroyAll containers", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, { image: "node:22-slim", maxTotal: 3 });
    await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });
    await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });
    await pool.destroyAll();
    expect(pool.stats().total).toBe(0);
  });

  it("should report correct stats", async () => {
    const docker = mockDocker();
    const pool = new DockerContainerPool(docker as any, { image: "node:22-slim", maxTotal: 5 });
    expect(pool.stats()).toEqual({ idle: 0, busy: 0, total: 0, maxTotal: 5 });

    const c1 = await pool.acquire({ trust: "sandboxed", timeout: 30, memory: "512m", cpu: "1.0" });
    expect(pool.stats()).toEqual({ idle: 0, busy: 1, total: 1, maxTotal: 5 });

    await pool.release(c1);
    expect(pool.stats()).toEqual({ idle: 1, busy: 0, total: 1, maxTotal: 5 });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @augure/sandbox test`
Expected: FAIL — `DockerContainerPool` doesn't exist.

**Step 3: Implement `packages/sandbox/src/pool.ts`**

```typescript
import type Dockerode from "dockerode";
import type { ContainerPool, ContainerOpts, PoolStats, Container } from "@augure/types";
import { DockerContainer } from "./container.js";

interface PoolConfig {
  image: string;
  maxTotal: number;
}

export class DockerContainerPool implements ContainerPool {
  private idle: DockerContainer[] = [];
  private busy = new Set<DockerContainer>();

  constructor(
    private readonly docker: Dockerode,
    private readonly config: PoolConfig,
  ) {}

  async acquire(opts: ContainerOpts): Promise<Container> {
    // Try to reuse idle container
    const cached = this.idle.pop();
    if (cached) {
      this.busy.add(cached);
      return cached;
    }

    // Check limit
    if (this.busy.size + this.idle.length >= this.config.maxTotal) {
      throw new Error("Pool limit reached: all containers are in use");
    }

    // Create new
    const raw = await this.docker.createContainer({
      Image: this.config.image,
      Cmd: ["sleep", "infinity"],
      WorkingDir: "/workspace",
      NetworkDisabled: opts.trust === "sandboxed",
      Env: opts.env
        ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      HostConfig: {
        Memory: parseMemory(opts.memory),
        NanoCpus: parseCpu(opts.cpu),
        NetworkMode: opts.trust === "trusted" ? "host" : undefined,
        Binds: opts.mounts?.map(
          (m) => `${m.host}:${m.container}${m.readonly ? ":ro" : ""}`,
        ),
      },
    });

    await raw.start();
    const container = new DockerContainer(raw);
    this.busy.add(container);
    return container;
  }

  async release(container: Container): Promise<void> {
    const dc = container as DockerContainer;
    this.busy.delete(dc);
    if (dc.status === "stopped") {
      return; // tainted, don't cache
    }
    this.idle.push(dc);
  }

  async destroy(container: Container): Promise<void> {
    const dc = container as DockerContainer;
    this.busy.delete(dc);
    const idxIdle = this.idle.indexOf(dc);
    if (idxIdle !== -1) this.idle.splice(idxIdle, 1);
    await dc.stop();
  }

  async destroyAll(): Promise<void> {
    const all = [...this.busy, ...this.idle];
    this.busy.clear();
    this.idle = [];
    await Promise.all(all.map((c) => c.stop()));
  }

  stats(): PoolStats {
    return {
      idle: this.idle.length,
      busy: this.busy.size,
      total: this.idle.length + this.busy.size,
      maxTotal: this.config.maxTotal,
    };
  }
}

function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+)(m|g)$/i);
  if (!match) throw new Error(`Invalid memory format: ${mem}`);
  const [, val, unit] = match;
  return Number(val) * (unit.toLowerCase() === "g" ? 1073741824 : 1048576);
}

function parseCpu(cpu: string): number {
  return Math.floor(Number(cpu) * 1e9);
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @augure/sandbox test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sandbox/src/pool.ts packages/sandbox/src/__tests__/pool.test.ts
git commit -m "feat(sandbox): implement DockerContainerPool with on-demand + reuse"
```

---

### Task 6: Update `@augure/sandbox` barrel export

**Files:**
- Modify: `packages/sandbox/src/index.ts`

**Step 1: Update `packages/sandbox/src/index.ts`**

Replace the stub with real exports:

```typescript
export { DockerContainer } from "./container.js";
export { DockerContainerPool } from "./pool.js";
```

**Step 2: Run typecheck**

Run: `pnpm --filter @augure/sandbox typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/sandbox/src/index.ts
git commit -m "feat(sandbox): export DockerContainer and DockerContainerPool"
```

---

### Task 7: Implement `sandbox_exec` tool

**Files:**
- Create: `packages/tools/src/sandbox-exec.ts`
- Create: `packages/tools/src/__tests__/sandbox-exec.test.ts`
- Modify: `packages/tools/src/index.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { sandboxExecTool } from "../sandbox-exec.js";
import type { ToolContext, MemoryStore, Scheduler, ContainerPool, Container } from "@augure/types";

function mockContainer(): Container {
  return {
    id: "test-container",
    status: "idle",
    exec: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "hello world\n",
      stderr: "",
    }),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

function mockPool(container?: Container): ContainerPool {
  const c = container ?? mockContainer();
  return {
    acquire: vi.fn().mockResolvedValue(c),
    release: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    destroyAll: vi.fn().mockResolvedValue(undefined),
    stats: vi.fn().mockReturnValue({ idle: 0, busy: 1, total: 1, maxTotal: 3 }),
  };
}

function makeCtx(pool?: ContainerPool): ToolContext {
  return {
    config: {
      sandbox: {
        runtime: "docker",
        defaults: { timeout: 30, memoryLimit: "512m", cpuLimit: "1.0" },
      },
      security: { maxConcurrentSandboxes: 3 },
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
    pool: pool ?? mockPool(),
  };
}

describe("sandbox_exec tool", () => {
  it("should execute a command and return stdout", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);
    const result = await sandboxExecTool.execute({ command: "echo hello" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("hello world");
    expect(result.output).toContain("Exit code: 0");
    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "sandboxed" }),
    );
    expect(pool.release).toHaveBeenCalled();
  });

  it("should forward trust level", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);
    await sandboxExecTool.execute({ command: "ls", trust: "trusted" }, ctx);

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "trusted" }),
    );
  });

  it("should return error when pool is not available", async () => {
    const ctx = makeCtx();
    delete (ctx as any).pool;
    const result = await sandboxExecTool.execute({ command: "echo hi" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("Sandbox pool is not available");
  });

  it("should report non-zero exit code", async () => {
    const c = mockContainer();
    (c.exec as any).mockResolvedValue({ exitCode: 1, stdout: "", stderr: "error msg" });
    const pool = mockPool(c);
    const ctx = makeCtx(pool);
    const result = await sandboxExecTool.execute({ command: "bad" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("Exit code: 1");
    expect(result.output).toContain("error msg");
  });

  it("should release container even on error", async () => {
    const c = mockContainer();
    (c.exec as any).mockRejectedValue(new Error("boom"));
    const pool = mockPool(c);
    const ctx = makeCtx(pool);
    const result = await sandboxExecTool.execute({ command: "fail" }, ctx);

    expect(result.success).toBe(false);
    expect(pool.release).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @augure/tools test -- sandbox-exec`
Expected: FAIL — module doesn't exist.

**Step 3: Implement `packages/tools/src/sandbox-exec.ts`**

```typescript
import type { NativeTool } from "@augure/types";

export const sandboxExecTool: NativeTool = {
  name: "sandbox_exec",
  description:
    "Execute a shell command in an isolated Docker container. Returns stdout, stderr, and exit code.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      trust: {
        type: "string",
        enum: ["sandboxed", "trusted"],
        description: "Trust level (default: sandboxed). 'sandboxed' has no network. 'trusted' has host network.",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: from config)",
      },
    },
    required: ["command"],
  },
  execute: async (params, ctx) => {
    const { command, trust, timeout } = params as {
      command: string;
      trust?: "sandboxed" | "trusted";
      timeout?: number;
    };

    if (!ctx.pool) {
      return { success: false, output: "Sandbox pool is not available" };
    }

    const defaults = ctx.config.sandbox.defaults;
    const container = await ctx.pool.acquire({
      trust: trust ?? "sandboxed",
      timeout: timeout ?? defaults.timeout,
      memory: defaults.memoryLimit,
      cpu: defaults.cpuLimit,
    });

    try {
      const result = await container.exec(command, {
        timeout: timeout ?? defaults.timeout,
      });

      const parts: string[] = [];
      if (result.stdout) parts.push(result.stdout);
      if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
      parts.push(`Exit code: ${result.exitCode}`);

      return {
        success: result.exitCode === 0,
        output: parts.join("\n"),
      };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await ctx.pool.release(container);
    }
  },
};
```

**Step 4: Export from `packages/tools/src/index.ts`**

Add: `export { sandboxExecTool } from "./sandbox-exec.js";`

**Step 5: Run tests to verify they pass**

Run: `pnpm --filter @augure/tools test -- sandbox-exec`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/tools/src/sandbox-exec.ts packages/tools/src/__tests__/sandbox-exec.test.ts packages/tools/src/index.ts
git commit -m "feat(tools): add sandbox_exec tool"
```

---

### Task 8: Implement `opencode` tool

**Files:**
- Create: `packages/tools/src/opencode.ts`
- Create: `packages/tools/src/__tests__/opencode.test.ts`
- Modify: `packages/tools/src/index.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { opencodeTool } from "../opencode.js";
import type { ToolContext, MemoryStore, Scheduler, ContainerPool, Container } from "@augure/types";

function mockContainer(): Container {
  return {
    id: "test-container",
    status: "idle",
    exec: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "Task completed successfully.\n",
      stderr: "",
    }),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

function mockPool(container?: Container): ContainerPool {
  const c = container ?? mockContainer();
  return {
    acquire: vi.fn().mockResolvedValue(c),
    release: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    destroyAll: vi.fn().mockResolvedValue(undefined),
    stats: vi.fn().mockReturnValue({ idle: 0, busy: 1, total: 1, maxTotal: 3 }),
  };
}

function makeCtx(pool?: ContainerPool, codeAgent?: any): ToolContext {
  return {
    config: {
      sandbox: {
        runtime: "docker",
        defaults: { timeout: 120, memoryLimit: "1g", cpuLimit: "2.0" },
        codeAgent: codeAgent ?? {
          command: "claude-code",
          args: ["--no-interactive"],
          env: { ANTHROPIC_API_KEY: "sk-test" },
        },
      },
      security: { maxConcurrentSandboxes: 3 },
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
    pool: pool ?? mockPool(),
  };
}

describe("opencode tool", () => {
  it("should execute code agent with task", async () => {
    const c = mockContainer();
    const pool = mockPool(c);
    const ctx = makeCtx(pool);
    const result = await opencodeTool.execute({ task: "Fix the login bug" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Task completed successfully");
    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "trusted" }),
    );
    expect(c.exec).toHaveBeenCalledWith(
      expect.stringContaining("claude-code"),
      expect.objectContaining({
        env: expect.objectContaining({ ANTHROPIC_API_KEY: "sk-test" }),
      }),
    );
  });

  it("should assemble command with args and task", async () => {
    const c = mockContainer();
    const pool = mockPool(c);
    const ctx = makeCtx(pool);
    await opencodeTool.execute({ task: "Add tests" }, ctx);

    const execCall = (c.exec as any).mock.calls[0][0] as string;
    expect(execCall).toContain("claude-code");
    expect(execCall).toContain("--no-interactive");
    expect(execCall).toContain("Add tests");
  });

  it("should return error when codeAgent is not configured", async () => {
    const ctx = makeCtx(mockPool(), undefined);
    (ctx.config.sandbox as any).codeAgent = undefined;
    const result = await opencodeTool.execute({ task: "Do something" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("codeAgent is not configured");
  });

  it("should return error when pool is not available", async () => {
    const ctx = makeCtx();
    delete (ctx as any).pool;
    const result = await opencodeTool.execute({ task: "Do something" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("Sandbox pool is not available");
  });

  it("should use trusted trust level by default", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);
    await opencodeTool.execute({ task: "Work" }, ctx);

    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "trusted" }),
    );
  });

  it("should release container after execution", async () => {
    const pool = mockPool();
    const ctx = makeCtx(pool);
    await opencodeTool.execute({ task: "Work" }, ctx);
    expect(pool.release).toHaveBeenCalled();
  });

  it("should release container even on error", async () => {
    const c = mockContainer();
    (c.exec as any).mockRejectedValue(new Error("agent crashed"));
    const pool = mockPool(c);
    const ctx = makeCtx(pool);
    await opencodeTool.execute({ task: "Work" }, ctx);
    expect(pool.release).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @augure/tools test -- opencode`
Expected: FAIL — module doesn't exist.

**Step 3: Implement `packages/tools/src/opencode.ts`**

```typescript
import type { NativeTool } from "@augure/types";

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const opencodeTool: NativeTool = {
  name: "opencode",
  description:
    "Run a code agent (claude-code, opencode, codex CLI) in a Docker container to perform a coding task.",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Natural language task description for the code agent",
      },
      trust: {
        type: "string",
        enum: ["sandboxed", "trusted"],
        description: "Trust level (default: trusted)",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: from config)",
      },
    },
    required: ["task"],
  },
  execute: async (params, ctx) => {
    const { task, trust, timeout } = params as {
      task: string;
      trust?: "sandboxed" | "trusted";
      timeout?: number;
    };

    if (!ctx.pool) {
      return { success: false, output: "Sandbox pool is not available" };
    }

    const agentConfig = ctx.config.sandbox.codeAgent;
    if (!agentConfig) {
      return {
        success: false,
        output: "codeAgent is not configured in sandbox config",
      };
    }

    const defaults = ctx.config.sandbox.defaults;
    const container = await ctx.pool.acquire({
      trust: trust ?? "trusted",
      timeout: timeout ?? defaults.timeout,
      memory: defaults.memoryLimit,
      cpu: defaults.cpuLimit,
      env: agentConfig.env,
    });

    try {
      const cmdParts = [agentConfig.command];
      if (agentConfig.args) cmdParts.push(...agentConfig.args);
      cmdParts.push(shellEscape(task));
      const command = cmdParts.join(" ");

      const result = await container.exec(command, {
        timeout: timeout ?? defaults.timeout,
        env: agentConfig.env,
      });

      const parts: string[] = [];
      if (result.stdout) parts.push(result.stdout);
      if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
      parts.push(`Exit code: ${result.exitCode}`);

      return {
        success: result.exitCode === 0,
        output: parts.join("\n"),
      };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await ctx.pool.release(container);
    }
  },
};
```

**Step 4: Export from `packages/tools/src/index.ts`**

Add: `export { opencodeTool } from "./opencode.js";`

**Step 5: Run tests to verify they pass**

Run: `pnpm --filter @augure/tools test -- opencode`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/tools/src/opencode.ts packages/tools/src/__tests__/opencode.test.ts packages/tools/src/index.ts
git commit -m "feat(tools): add opencode tool (code agent bridge)"
```

---

### Task 9: Create Dockerfile for universal sandbox image

**Files:**
- Create: `docker/sandbox/Dockerfile`

**Step 1: Create `docker/sandbox/Dockerfile`**

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip curl jq git gh ripgrep \
    && npx playwright install-deps chromium \
    && npx playwright install chromium \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
```

**Step 2: Verify the image builds (if Docker available)**

```bash
docker build -t augure-sandbox:latest docker/sandbox/
```

Expected: Build succeeds. Skip if Docker not installed.

**Step 3: Commit**

```bash
git add docker/sandbox/Dockerfile
git commit -m "feat(sandbox): add universal sandbox Docker image"
```

---

### Task 10: Wire pool and tools into main.ts

**Files:**
- Modify: `packages/core/src/main.ts`

**Step 1: Update `main.ts` to create pool and register sandbox tools**

Add imports at top:

```typescript
import Dockerode from "dockerode";
import { DockerContainerPool } from "@augure/sandbox";
```

Also import the new tools:

```typescript
import {
  ToolRegistry,
  memoryReadTool,
  memoryWriteTool,
  scheduleTool,
  webSearchTool,
  httpTool,
  sandboxExecTool,
  opencodeTool,
} from "@augure/tools";
```

In `startAgent()`, after the `scheduler` setup and before `tools.setContext(...)`:

```typescript
// Create container pool
const docker = new Dockerode();
const pool = new DockerContainerPool(docker, {
  image: config.sandbox.image ?? "augure-sandbox:latest",
  maxTotal: config.security.maxConcurrentSandboxes,
});
console.log(`[augure] Container pool created (max: ${config.security.maxConcurrentSandboxes})`);
```

Register the new tools:

```typescript
tools.register(sandboxExecTool);
tools.register(opencodeTool);
```

Update `setContext` to include pool:

```typescript
tools.setContext({ config, memory, scheduler, pool });
```

Update the `shutdown` handler to destroy containers:

```typescript
const shutdown = async () => {
  console.log("\n[augure] Shutting down...");
  heartbeat.stop();
  scheduler.stop();
  await pool.destroyAll();
  console.log("[augure] All containers destroyed");
  process.exit(0);
};
```

**Step 2: Add `@augure/sandbox` and `dockerode` to `@augure/core` dependencies**

```bash
pnpm --filter @augure/core add @augure/sandbox@workspace:* dockerode
pnpm --filter @augure/core add -D @types/dockerode
```

Add `{ "path": "../sandbox" }` to `packages/core/tsconfig.json` references.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/core/src/main.ts packages/core/package.json packages/core/tsconfig.json pnpm-lock.yaml
git commit -m "feat(core): wire sandbox pool and tools into agent startup"
```

---

### Task 11: Integration tests (real Docker, skip if unavailable)

**Files:**
- Create: `packages/sandbox/src/__tests__/integration.test.ts`

**Step 1: Write integration tests**

```typescript
import { describe, it, expect, afterAll } from "vitest";
import Dockerode from "dockerode";
import { DockerContainerPool } from "../pool.js";

const docker = new Dockerode();
let isDockerAvailable = false;

try {
  await docker.ping();
  isDockerAvailable = true;
} catch {
  // Docker not available — skip
}

describe.skipIf(!isDockerAvailable)("integration: real Docker", () => {
  const pool = new DockerContainerPool(docker, {
    image: "node:22-slim",
    maxTotal: 2,
  });

  afterAll(async () => {
    await pool.destroyAll();
  });

  it("should create a container and exec a command", async () => {
    const container = await pool.acquire({
      trust: "sandboxed",
      timeout: 10,
      memory: "256m",
      cpu: "0.5",
    });
    const result = await container.exec("echo hello");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    await pool.release(container);
  });

  it("should verify network isolation for sandboxed", async () => {
    const container = await pool.acquire({
      trust: "sandboxed",
      timeout: 10,
      memory: "256m",
      cpu: "0.5",
    });
    // curl should fail with no network
    const result = await container.exec("curl -s --max-time 2 https://example.com || echo NETWORK_BLOCKED");
    expect(result.stdout).toContain("NETWORK_BLOCKED");
    await pool.release(container);
  });

  it("should timeout on long-running commands", async () => {
    const container = await pool.acquire({
      trust: "sandboxed",
      timeout: 30,
      memory: "256m",
      cpu: "0.5",
    });
    await expect(container.exec("sleep 60", { timeout: 2 })).rejects.toThrow("timed out");
    await pool.destroy(container);
  });
});
```

**Step 2: Run integration tests**

Run: `pnpm --filter @augure/sandbox test`
Expected: PASS (skips gracefully if Docker not available, runs if Docker is present)

**Step 3: Commit**

```bash
git add packages/sandbox/src/__tests__/integration.test.ts
git commit -m "test(sandbox): add integration tests (skip if Docker unavailable)"
```

---

### Task 12: Full build + test + typecheck

**Step 1: Run full suite**

```bash
pnpm build && pnpm typecheck && pnpm test
```

Expected: All packages build, typecheck, and tests pass.

**Step 2: Commit any remaining fixes**

If anything breaks, fix and commit.

---

## Summary

| Task | What | Package |
|------|------|---------|
| 1 | Sandbox types (ContainerPool, Container, ExecResult) | `@augure/types` |
| 2 | Zod schema update (image, codeAgent) | `@augure/core` |
| 3 | Install dockerode, wire deps | `@augure/sandbox` |
| 4 | Container wrapper (DockerContainer) | `@augure/sandbox` |
| 5 | ContainerPool (on-demand + reuse) | `@augure/sandbox` |
| 6 | Barrel export update | `@augure/sandbox` |
| 7 | `sandbox_exec` native tool | `@augure/tools` |
| 8 | `opencode` native tool | `@augure/tools` |
| 9 | Dockerfile for sandbox image | `docker/sandbox/` |
| 10 | Wire pool + tools into main.ts | `@augure/core` |
| 11 | Integration tests (real Docker) | `@augure/sandbox` |
| 12 | Full build + test + typecheck | all |
