# M1 — Memory & Proactivity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire tool stubs to real implementations, build the memory ingestion/retrieval pipeline, add job persistence, and implement the heartbeat system — making Augure a proactive agent that learns from conversations.

**Architecture:** Tools gain a rich `ToolContext` carrying `MemoryStore` + `Scheduler` references so tool execute() functions can access real services. Memory ingestion uses a cheap LLM to extract observations from conversations and append them as dated entries to `observations.md`. The heartbeat runs on a configurable interval, using the monitoring model to decide if proactive action is needed. Jobs persist to a JSON file on disk so scheduled tasks survive restarts.

**Tech Stack:** TypeScript 5.9, vitest 4.x, node-cron, JSON5, zod v4, Node 22 ESM

---

### Task 1: Enrich ToolContext with MemoryStore and Scheduler

The current `ToolContext` in `@augure/types` only has `config: AppConfig`. Tools need access to `MemoryStore` and `Scheduler` to actually do their job.

**Files:**
- Modify: `packages/types/src/tools.ts`
- Test: `packages/tools/src/__tests__/registry.test.ts`

**Step 1: Write the failing test**

In `packages/tools/src/__tests__/registry.test.ts`, add a test that verifies ToolContext carries memory and scheduler:

```typescript
import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../registry.js";
import type { ToolContext, ToolResult, NativeTool, MemoryStore, Scheduler } from "@augure/types";

describe("ToolRegistry", () => {
  it("should pass context with memory and scheduler to tool execute", async () => {
    const registry = new ToolRegistry();
    let receivedCtx: ToolContext | undefined;

    const tool: NativeTool = {
      name: "test_ctx",
      description: "test",
      parameters: {},
      execute: async (_params: unknown, ctx: ToolContext): Promise<ToolResult> => {
        receivedCtx = ctx;
        return { success: true, output: "ok" };
      },
    };

    registry.register(tool);

    const mockMemory = {
      read: vi.fn(),
      write: vi.fn(),
      append: vi.fn(),
      list: vi.fn(),
      exists: vi.fn(),
    } as unknown as MemoryStore;

    const mockScheduler = {
      start: vi.fn(),
      stop: vi.fn(),
      addJob: vi.fn(),
      removeJob: vi.fn(),
      listJobs: vi.fn(),
      triggerJob: vi.fn(),
    } as unknown as Scheduler;

    registry.setContext({
      config: {} as ToolContext["config"],
      memory: mockMemory,
      scheduler: mockScheduler,
    });

    await registry.execute("test_ctx", {});
    expect(receivedCtx).toBeDefined();
    expect(receivedCtx!.memory).toBe(mockMemory);
    expect(receivedCtx!.scheduler).toBe(mockScheduler);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: FAIL — `ToolContext` has no `memory` or `scheduler` property.

**Step 3: Update ToolContext type**

In `packages/types/src/tools.ts`, add the missing fields:

```typescript
import type { MemoryStore } from "./memory.js";
import type { Scheduler } from "./scheduler.js";

// ... keep existing imports/exports ...

export interface ToolContext {
  config: AppConfig;
  memory: MemoryStore;
  scheduler: Scheduler;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/types/src/tools.ts packages/tools/src/__tests__/registry.test.ts
git commit -m "feat(types): enrich ToolContext with memory and scheduler"
```

---

### Task 2: Wire memory_read and memory_write tools

Replace the "Not wired yet" stubs with actual implementations that use `ctx.memory`.

**Files:**
- Modify: `packages/tools/src/memory.ts`
- Test: `packages/tools/src/__tests__/memory-tools.test.ts` (create)

**Step 1: Write the failing tests**

Create `packages/tools/src/__tests__/memory-tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryReadTool, memoryWriteTool } from "../memory.js";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

function makeCtx(memoryOverrides: Partial<MemoryStore> = {}): ToolContext {
  return {
    config: {} as ToolContext["config"],
    memory: {
      read: vi.fn().mockResolvedValue("file content"),
      write: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(true),
      ...memoryOverrides,
    } as unknown as MemoryStore,
    scheduler: {} as Scheduler,
  };
}

describe("memoryReadTool", () => {
  it("should read from memory store", async () => {
    const ctx = makeCtx();
    const result = await memoryReadTool.execute({ path: "observations.md" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe("file content");
    expect(ctx.memory.read).toHaveBeenCalledWith("observations.md");
  });

  it("should return error on read failure", async () => {
    const ctx = makeCtx({
      read: vi.fn().mockRejectedValue(new Error("not found")),
    });
    const result = await memoryReadTool.execute({ path: "missing.md" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("not found");
  });

  it("should list files when path is omitted", async () => {
    const ctx = makeCtx({
      list: vi.fn().mockResolvedValue(["a.md", "b.md"]),
    });
    const result = await memoryReadTool.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("a.md");
    expect(result.output).toContain("b.md");
  });
});

describe("memoryWriteTool", () => {
  it("should write to memory store", async () => {
    const ctx = makeCtx();
    const result = await memoryWriteTool.execute(
      { path: "notes.md", content: "hello" },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.memory.write).toHaveBeenCalledWith("notes.md", "hello");
  });

  it("should return error on write failure", async () => {
    const ctx = makeCtx({
      write: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    const result = await memoryWriteTool.execute(
      { path: "x.md", content: "y" },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain("disk full");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: FAIL — tools still return "Not wired yet"

**Step 3: Implement the tools**

Replace `packages/tools/src/memory.ts`:

```typescript
import type { NativeTool } from "@augure/types";

export const memoryReadTool: NativeTool = {
  name: "memory_read",
  description:
    "Read content from memory. If path is provided, reads that file. If path is omitted, lists all memory files.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The memory file path to read (omit to list all files)",
      },
    },
  },
  execute: async (params, ctx) => {
    const { path } = params as { path?: string };
    try {
      if (!path) {
        const files = await ctx.memory.list();
        return { success: true, output: files.join("\n") };
      }
      const content = await ctx.memory.read(path);
      return { success: true, output: content };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export const memoryWriteTool: NativeTool = {
  name: "memory_write",
  description: "Write content to a memory file at the given path",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The memory file path to write to" },
      content: { type: "string", description: "The content to write" },
    },
    required: ["path", "content"],
  },
  execute: async (params, ctx) => {
    const { path, content } = params as { path: string; content: string };
    try {
      await ctx.memory.write(path, content);
      return { success: true, output: `Written to ${path}` };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/memory.ts packages/tools/src/__tests__/memory-tools.test.ts
git commit -m "feat(tools): wire memory_read and memory_write to MemoryStore"
```

---

### Task 3: Wire the schedule tool

Replace the schedule tool stub with an implementation that calls `ctx.scheduler`.

**Files:**
- Modify: `packages/tools/src/schedule.ts`
- Test: `packages/tools/src/__tests__/schedule-tool.test.ts` (create)

**Step 1: Write the failing tests**

Create `packages/tools/src/__tests__/schedule-tool.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { scheduleTool } from "../schedule.js";
import type { ToolContext, MemoryStore, Scheduler, Job } from "@augure/types";

function makeCtx(schedulerOverrides: Partial<Scheduler> = {}): ToolContext {
  return {
    config: {} as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {
      start: vi.fn(),
      stop: vi.fn(),
      addJob: vi.fn(),
      removeJob: vi.fn(),
      listJobs: vi.fn().mockReturnValue([]),
      triggerJob: vi.fn(),
      ...schedulerOverrides,
    } as unknown as Scheduler,
  };
}

describe("scheduleTool", () => {
  it("should list jobs", async () => {
    const jobs: Job[] = [
      { id: "j1", cron: "0 8 * * *", prompt: "morning", channel: "tg", enabled: true },
    ];
    const ctx = makeCtx({ listJobs: vi.fn().mockReturnValue(jobs) });
    const result = await scheduleTool.execute({ action: "list" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("j1");
    expect(result.output).toContain("0 8 * * *");
  });

  it("should create a job", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute(
      { action: "create", id: "j2", cron: "*/10 * * * *", prompt: "check" },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.scheduler.addJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "j2", cron: "*/10 * * * *", prompt: "check" }),
    );
  });

  it("should delete a job", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute({ action: "delete", id: "j1" }, ctx);
    expect(result.success).toBe(true);
    expect(ctx.scheduler.removeJob).toHaveBeenCalledWith("j1");
  });

  it("should return error for unknown action", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute({ action: "unknown" }, ctx);
    expect(result.success).toBe(false);
  });

  it("should return error when create is missing cron", async () => {
    const ctx = makeCtx();
    const result = await scheduleTool.execute(
      { action: "create", prompt: "test" },
      ctx,
    );
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: FAIL

**Step 3: Implement the schedule tool**

Replace `packages/tools/src/schedule.ts`:

```typescript
import type { NativeTool } from "@augure/types";

export const scheduleTool: NativeTool = {
  name: "schedule",
  description: "Manage scheduled tasks: create, delete, or list cron jobs",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "delete", "list"],
        description: "The scheduling action to perform",
      },
      id: { type: "string", description: "The schedule ID (for create/delete)" },
      cron: { type: "string", description: "Cron expression (for create)" },
      prompt: { type: "string", description: "The prompt to execute on schedule (for create)" },
    },
    required: ["action"],
  },
  execute: async (params, ctx) => {
    const { action, id, cron, prompt } = params as {
      action: string;
      id?: string;
      cron?: string;
      prompt?: string;
    };

    try {
      switch (action) {
        case "list": {
          const jobs = ctx.scheduler.listJobs();
          if (jobs.length === 0) {
            return { success: true, output: "No scheduled jobs." };
          }
          const lines = jobs.map(
            (j) => `- ${j.id}: "${j.prompt}" @ ${j.cron} (${j.enabled ? "enabled" : "disabled"})`,
          );
          return { success: true, output: lines.join("\n") };
        }
        case "create": {
          if (!cron || !prompt) {
            return { success: false, output: "Missing required fields: cron and prompt" };
          }
          const jobId = id ?? `job-${Date.now()}`;
          ctx.scheduler.addJob({
            id: jobId,
            cron,
            prompt,
            channel: "default",
            enabled: true,
          });
          return { success: true, output: `Created job ${jobId}` };
        }
        case "delete": {
          if (!id) {
            return { success: false, output: "Missing required field: id" };
          }
          ctx.scheduler.removeJob(id);
          return { success: true, output: `Deleted job ${id}` };
        }
        default:
          return { success: false, output: `Unknown action: ${action}` };
      }
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/tools test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/schedule.ts packages/tools/src/__tests__/schedule-tool.test.ts
git commit -m "feat(tools): wire schedule tool to Scheduler"
```

---

### Task 4: Wire ToolContext in main.ts

Update `startAgent()` to build a proper `ToolContext` with memory + scheduler and pass it to the tool registry.

**Files:**
- Modify: `packages/core/src/main.ts`

**Step 1: Update main.ts**

In `packages/core/src/main.ts`, after creating `memory`, `scheduler`, and `tools`, add:

```typescript
// After line 42 (tools.register(memoryWriteTool)), add:
tools.register(scheduleTool);

tools.setContext({
  config,
  memory,
  scheduler,
});
```

Also add the import for `scheduleTool`:

```typescript
import { ToolRegistry, memoryReadTool, memoryWriteTool, scheduleTool } from "@augure/tools";
```

**Step 2: Verify build succeeds**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build`
Expected: All packages build successfully.

**Step 3: Run all tests**

Run: `cd /Users/alexis/lab/augure && pnpm turbo test`
Expected: All existing tests still pass. (The `main.ts` agent test mocks may need a `scheduler` field in the context — if so, update `packages/core/src/__tests__/agent.test.ts` to add a mock scheduler in the `ToolRegistry.setContext()` calls.)

**Step 4: Commit**

```bash
git add packages/core/src/main.ts
git commit -m "feat(core): wire ToolContext with memory, scheduler, and schedule tool"
```

---

### Task 5: Job persistence — save/load jobs from disk

The scheduler currently only keeps jobs in memory. We need a `JobStore` that persists to a JSON file so jobs survive restarts.

**Files:**
- Create: `packages/scheduler/src/jobs.ts`
- Modify: `packages/scheduler/src/index.ts`
- Test: `packages/scheduler/src/__tests__/jobs.test.ts` (create)

**Step 1: Write the failing tests**

Create `packages/scheduler/src/__tests__/jobs.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobStore } from "../jobs.js";
import type { Job } from "@augure/types";

describe("JobStore", () => {
  let dir: string;
  let store: JobStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jobs-test-"));
    store = new JobStore(join(dir, "jobs.json"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should save and load jobs", async () => {
    const job: Job = {
      id: "j1",
      cron: "0 8 * * *",
      prompt: "morning check",
      channel: "telegram",
      enabled: true,
    };

    await store.save([job]);
    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(job);
  });

  it("should return empty array when file does not exist", async () => {
    const loaded = await store.load();
    expect(loaded).toEqual([]);
  });

  it("should overwrite existing file on save", async () => {
    const job1: Job = { id: "j1", cron: "0 8 * * *", prompt: "a", channel: "tg", enabled: true };
    const job2: Job = { id: "j2", cron: "0 9 * * *", prompt: "b", channel: "tg", enabled: true };

    await store.save([job1, job2]);
    await store.save([job2]);

    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("j2");
  });

  it("should write valid JSON to disk", async () => {
    const job: Job = { id: "j1", cron: "* * * * *", prompt: "test", channel: "c", enabled: true };
    await store.save([job]);

    const raw = await readFile(join(dir, "jobs.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual([job]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: FAIL — `JobStore` does not exist.

**Step 3: Implement JobStore**

Create `packages/scheduler/src/jobs.ts`:

```typescript
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Job } from "@augure/types";

export class JobStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Job[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as Job[];
    } catch {
      return [];
    }
  }

  async save(jobs: Job[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(jobs, null, 2), "utf-8");
  }
}
```

**Step 4: Update index.ts**

In `packages/scheduler/src/index.ts`, add:

```typescript
export { CronScheduler } from "./cron.js";
export { JobStore } from "./jobs.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/scheduler/src/jobs.ts packages/scheduler/src/index.ts packages/scheduler/src/__tests__/jobs.test.ts
git commit -m "feat(scheduler): add JobStore for persisting jobs to disk"
```

---

### Task 6: Integrate JobStore into CronScheduler

Make the scheduler persist jobs automatically when they're added or removed.

**Files:**
- Modify: `packages/scheduler/src/cron.ts`
- Modify: `packages/scheduler/src/__tests__/cron.test.ts`

**Step 1: Write the failing tests**

Add tests to `packages/scheduler/src/__tests__/cron.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CronScheduler } from "../cron.js";
import { JobStore } from "../jobs.js";
import type { Job } from "@augure/types";

// ... keep existing makeJob and tests ...

describe("CronScheduler with persistence", () => {
  let dir: string;
  let store: JobStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sched-test-"));
    store = new JobStore(join(dir, "jobs.json"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should persist jobs when added", async () => {
    const scheduler = new CronScheduler(store);
    scheduler.addJob(makeJob());
    scheduler.stop();

    // Wait for async persist
    await new Promise((r) => setTimeout(r, 50));

    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("job-1");
  });

  it("should persist after removal", async () => {
    const scheduler = new CronScheduler(store);
    scheduler.addJob(makeJob({ id: "a" }));
    scheduler.addJob(makeJob({ id: "b" }));
    scheduler.removeJob("a");
    scheduler.stop();

    await new Promise((r) => setTimeout(r, 50));

    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("b");
  });

  it("should load persisted jobs on loadPersistedJobs()", async () => {
    await store.save([makeJob({ id: "restored" })]);

    const scheduler = new CronScheduler(store);
    await scheduler.loadPersistedJobs();

    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("restored");

    scheduler.stop();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: FAIL — CronScheduler doesn't accept a `JobStore` argument.

**Step 3: Update CronScheduler**

Modify `packages/scheduler/src/cron.ts`:

```typescript
import { createTask, validate, type ScheduledTask } from "node-cron";
import type { Job, Scheduler } from "@augure/types";
import type { JobStore } from "./jobs.js";

type JobTriggerHandler = (job: Job) => void | Promise<void>;

export class CronScheduler implements Scheduler {
  private jobs = new Map<string, Job>();
  private tasks = new Map<string, ScheduledTask>();
  private handlers: JobTriggerHandler[] = [];

  constructor(private readonly store?: JobStore) {}

  onJobTrigger(handler: JobTriggerHandler): void {
    this.handlers.push(handler);
  }

  addJob(job: Job): void {
    if (!validate(job.cron)) {
      throw new Error(`Invalid cron expression: ${job.cron}`);
    }

    this.jobs.set(job.id, job);

    if (job.enabled) {
      const task = createTask(job.cron, () => {
        void this.executeHandlers(job);
      });
      this.tasks.set(job.id, task);
    }

    void this.persist();
  }

  removeJob(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
    }
    this.jobs.delete(id);
    void this.persist();
  }

  listJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  async triggerJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }
    await this.executeHandlers(job);
  }

  async loadPersistedJobs(): Promise<void> {
    if (!this.store) return;
    const jobs = await this.store.load();
    for (const job of jobs) {
      this.addJob(job);
    }
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

  private async persist(): Promise<void> {
    if (!this.store) return;
    await this.store.save(this.listJobs());
  }

  private async executeHandlers(job: Job): Promise<void> {
    for (const handler of this.handlers) {
      await handler(job);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: PASS (both old and new tests)

**Step 5: Commit**

```bash
git add packages/scheduler/src/cron.ts packages/scheduler/src/__tests__/cron.test.ts
git commit -m "feat(scheduler): integrate JobStore for automatic persistence"
```

---

### Task 7: Memory ingestion — extract observations from conversations

The core M1 feature. After each conversation, a cheap LLM extracts key facts and appends dated observations to `observations.md`.

**Files:**
- Create: `packages/memory/src/ingest.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/ingest.test.ts` (create)

**Step 1: Write the failing tests**

Create `packages/memory/src/__tests__/ingest.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryIngester } from "../ingest.js";
import { FileMemoryStore } from "../store.js";
import type { LLMClient, Message } from "@augure/types";

function mockLLM(extractedFacts: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: extractedFacts,
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
  };
}

describe("MemoryIngester", () => {
  let dir: string;
  let store: FileMemoryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ingest-test-"));
    store = new FileMemoryStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should extract observations and append to observations.md", async () => {
    const llm = mockLLM("- User prefers TypeScript\n- Working on project Augure");
    const ingester = new MemoryIngester(llm, store);

    const conversation: Message[] = [
      { role: "user", content: "I'm building Augure in TypeScript" },
      { role: "assistant", content: "Great choice! TypeScript is excellent for this." },
    ];

    await ingester.ingest(conversation);

    const content = await store.read("observations.md");
    expect(content).toContain("User prefers TypeScript");
    expect(content).toContain("Working on project Augure");
  });

  it("should prepend a date header", async () => {
    const llm = mockLLM("- Some fact");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);

    const content = await store.read("observations.md");
    // Date header in format ## YYYY-MM-DD
    expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}/);
  });

  it("should append to existing observations without overwriting", async () => {
    await store.write("observations.md", "## 2026-02-20\n- Old observation\n\n");

    const llm = mockLLM("- New observation");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Something new" },
      { role: "assistant", content: "Got it" },
    ]);

    const content = await store.read("observations.md");
    expect(content).toContain("Old observation");
    expect(content).toContain("New observation");
  });

  it("should skip ingestion if conversation is empty", async () => {
    const llm = mockLLM("nothing");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([]);

    expect(await store.exists("observations.md")).toBe(false);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it("should skip ingestion if LLM returns no observations", async () => {
    const llm = mockLLM("No notable observations.");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);

    // The LLM was called but returned nothing meaningful with bullet points
    expect(await store.exists("observations.md")).toBe(false);
  });

  it("should pass the conversation to the LLM with extraction prompt", async () => {
    const llm = mockLLM("- Fact one");
    const ingester = new MemoryIngester(llm, store);

    await ingester.ingest([
      { role: "user", content: "Test message" },
      { role: "assistant", content: "Test reply" },
    ]);

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message[];
    const systemMsg = callArgs.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain("Extract");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/memory test`
Expected: FAIL — `MemoryIngester` does not exist.

**Step 3: Implement MemoryIngester**

Create `packages/memory/src/ingest.ts`:

```typescript
import type { LLMClient, Message, MemoryStore } from "@augure/types";

const EXTRACTION_PROMPT = `You are a memory extraction agent. Given a conversation, extract key factual observations about the user.

Rules:
- Return a markdown bullet list of observations (one per line, starting with "- ")
- Only extract facts, preferences, decisions, plans, and personal details
- Be concise: one fact per bullet
- If there are no notable observations, return exactly "No notable observations."
- Do not include greetings, small talk, or meta-conversation
- Use present tense ("User prefers X", not "User said they prefer X")

Example output:
- User prefers TypeScript over JavaScript
- User is building a project called Augure
- User lives in Bordeaux, France`;

export class MemoryIngester {
  constructor(
    private readonly llm: LLMClient,
    private readonly store: MemoryStore,
  ) {}

  async ingest(conversation: Message[]): Promise<void> {
    if (conversation.length === 0) return;

    const conversationText = conversation
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const messages: Message[] = [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: conversationText },
    ];

    const response = await this.llm.chat(messages);
    const observations = this.parseObservations(response.content);

    if (observations.length === 0) return;

    const date = new Date().toISOString().slice(0, 10);
    const block = `## ${date}\n${observations.map((o) => `- ${o}`).join("\n")}\n\n`;

    await this.store.append("observations.md", block);
  }

  private parseObservations(content: string): string[] {
    const lines = content.split("\n");
    return lines
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => line.trim().slice(2).trim())
      .filter((line) => line.length > 0);
  }
}
```

**Step 4: Update index.ts**

In `packages/memory/src/index.ts`:

```typescript
export { FileMemoryStore } from "./store.js";
export { MemoryIngester } from "./ingest.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/memory test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/memory/src/ingest.ts packages/memory/src/index.ts packages/memory/src/__tests__/ingest.test.ts
git commit -m "feat(memory): add MemoryIngester for extracting observations from conversations"
```

---

### Task 8: Memory retrieval — select relevant memory files for context

Build a retriever that reads memory files and assembles a context block to inject into the LLM prompt.

**Files:**
- Create: `packages/memory/src/retrieve.ts`
- Modify: `packages/memory/src/index.ts`
- Test: `packages/memory/src/__tests__/retrieve.test.ts` (create)

**Step 1: Write the failing tests**

Create `packages/memory/src/__tests__/retrieve.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryRetriever } from "../retrieve.js";
import { FileMemoryStore } from "../store.js";

describe("MemoryRetriever", () => {
  let dir: string;
  let store: FileMemoryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "retrieve-test-"));
    store = new FileMemoryStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should always include observations.md", async () => {
    await store.write("observations.md", "## 2026-02-21\n- User likes cats\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("User likes cats");
  });

  it("should always include identity.md", async () => {
    await store.write("identity.md", "Name: Alexis\nLocation: Bordeaux\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("Name: Alexis");
  });

  it("should include all available core memory files", async () => {
    await store.write("observations.md", "## 2026-02-21\n- Fact A\n");
    await store.write("identity.md", "User info\n");
    await store.write("preferences/communication.md", "Language: French\n");
    await store.write("context/active_tasks.md", "- Build Augure\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("Fact A");
    expect(result).toContain("User info");
    expect(result).toContain("Language: French");
    expect(result).toContain("Build Augure");
  });

  it("should label sections with file paths", async () => {
    await store.write("observations.md", "observations content\n");
    await store.write("preferences/interests.md", "interests content\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("### observations.md");
    expect(result).toContain("### preferences/interests.md");
  });

  it("should return empty string when no memory files exist", async () => {
    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();
    expect(result).toBe("");
  });

  it("should respect maxTokens limit (approximate)", async () => {
    // Write a large observation file
    const bigContent = "## 2026-02-21\n" + "- Observation line\n".repeat(5000);
    await store.write("observations.md", bigContent);
    await store.write("identity.md", "identity content\n");

    const retriever = new MemoryRetriever(store, { maxTokens: 500 });
    const result = await retriever.retrieve();

    // Rough check: at ~4 chars/token, 500 tokens ~ 2000 chars
    // Should be truncated well below the full file
    expect(result.length).toBeLessThan(bigContent.length);
    // Identity should still be present (priority files come first)
    expect(result).toContain("identity content");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/memory test`
Expected: FAIL — `MemoryRetriever` does not exist.

**Step 3: Implement MemoryRetriever**

Create `packages/memory/src/retrieve.ts`:

```typescript
import type { MemoryStore } from "@augure/types";

export interface RetrieverOptions {
  maxTokens?: number;
}

// Priority files loaded first (order matters)
const PRIORITY_FILES = ["identity.md", "observations.md"];

// Approximate token count: ~4 chars per token
const CHARS_PER_TOKEN = 4;

export class MemoryRetriever {
  private readonly maxChars: number;

  constructor(
    private readonly store: MemoryStore,
    options: RetrieverOptions = {},
  ) {
    const maxTokens = options.maxTokens ?? 10_000;
    this.maxChars = maxTokens * CHARS_PER_TOKEN;
  }

  async retrieve(): Promise<string> {
    const allFiles = await this.safeList();
    if (allFiles.length === 0) return "";

    // Priority files first, then the rest alphabetically
    const prioritySet = new Set(PRIORITY_FILES);
    const orderedFiles = [
      ...PRIORITY_FILES.filter((f) => allFiles.includes(f)),
      ...allFiles.filter((f) => !prioritySet.has(f)).sort(),
    ];

    const sections: string[] = [];
    let totalChars = 0;

    for (const file of orderedFiles) {
      if (totalChars >= this.maxChars) break;

      try {
        const content = await this.store.read(file);
        const header = `### ${file}`;
        const section = `${header}\n${content}`;
        const sectionChars = section.length;

        if (totalChars + sectionChars > this.maxChars) {
          // Truncate this section to fit
          const remaining = this.maxChars - totalChars;
          if (remaining > header.length + 50) {
            sections.push(section.slice(0, remaining) + "\n[...truncated]");
            totalChars = this.maxChars;
          }
          break;
        }

        sections.push(section);
        totalChars += sectionChars;
      } catch {
        // Skip files that can't be read
      }
    }

    return sections.join("\n\n");
  }

  private async safeList(): Promise<string[]> {
    try {
      return await this.store.list();
    } catch {
      return [];
    }
  }
}
```

**Step 4: Update index.ts**

In `packages/memory/src/index.ts`:

```typescript
export { FileMemoryStore } from "./store.js";
export { MemoryIngester } from "./ingest.js";
export { MemoryRetriever } from "./retrieve.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/memory test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/memory/src/retrieve.ts packages/memory/src/index.ts packages/memory/src/__tests__/retrieve.test.ts
git commit -m "feat(memory): add MemoryRetriever for context assembly"
```

---

### Task 9: Integrate ingestion + retrieval into the agent loop

Update the Agent to:
1. Use `MemoryRetriever` for dynamic memory context (instead of static string)
2. Trigger `MemoryIngester` after each conversation (when `autoIngest` is true)

**Files:**
- Modify: `packages/core/src/agent.ts`
- Modify: `packages/core/src/__tests__/agent.test.ts`

**Step 1: Write the failing tests**

Add new tests to `packages/core/src/__tests__/agent.test.ts`:

```typescript
// Add to existing imports
import type { MemoryStore } from "@augure/types";
import { MemoryIngester, MemoryRetriever } from "@augure/memory";

// Add these test cases to the existing describe("Agent") block:

it("should use MemoryRetriever for dynamic context when provided", async () => {
  const llm = createMockLLM({ content: "OK" });
  const tools = new ToolRegistry();

  const mockStore = {
    read: vi.fn().mockResolvedValue("dynamic memory content"),
    write: vi.fn(),
    append: vi.fn(),
    list: vi.fn().mockResolvedValue(["observations.md"]),
    exists: vi.fn().mockResolvedValue(true),
  } as unknown as MemoryStore;

  const retriever = new MemoryRetriever(mockStore);
  const agent = new Agent({
    llm,
    tools,
    systemPrompt: "You are Augure.",
    memoryContent: "",
    retriever,
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
  expect(systemMsg?.content).toContain("dynamic memory content");
});

it("should trigger ingestion after message when ingester is provided", async () => {
  const llm = createMockLLM({ content: "Response" });
  const tools = new ToolRegistry();

  const mockStore = {
    read: vi.fn().mockRejectedValue(new Error("not found")),
    write: vi.fn(),
    append: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as MemoryStore;

  const ingestLLM = createMockLLM({ content: "- User said hello" });
  const ingester = new MemoryIngester(ingestLLM, mockStore);
  const ingestSpy = vi.spyOn(ingester, "ingest");

  const agent = new Agent({
    llm,
    tools,
    systemPrompt: "You are Augure.",
    memoryContent: "",
    ingester,
  });

  await agent.handleMessage({
    id: "1",
    channelType: "telegram",
    userId: "123",
    text: "Hello",
    timestamp: new Date(),
  });

  expect(ingestSpy).toHaveBeenCalledOnce();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/core test`
Expected: FAIL — Agent doesn't accept `retriever` or `ingester` config.

**Step 3: Update Agent**

Modify `packages/core/src/agent.ts`:

```typescript
import type { LLMClient, Message, IncomingMessage } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import type { MemoryIngester, MemoryRetriever } from "@augure/memory";
import { assembleContext } from "./context.js";

export interface AgentConfig {
  llm: LLMClient;
  tools: ToolRegistry;
  systemPrompt: string;
  memoryContent: string;
  persona?: string;
  maxToolLoops?: number;
  retriever?: MemoryRetriever;
  ingester?: MemoryIngester;
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

    // Use dynamic retrieval if available, otherwise fall back to static string
    let memoryContent = this.config.memoryContent;
    if (this.config.retriever) {
      memoryContent = await this.config.retriever.retrieve();
    }

    const maxLoops = this.config.maxToolLoops ?? 10;
    let loopCount = 0;

    while (loopCount < maxLoops) {
      const messages = assembleContext({
        systemPrompt: this.config.systemPrompt,
        memoryContent,
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

        // Trigger ingestion in background (don't block response)
        if (this.config.ingester) {
          this.config.ingester
            .ingest(this.conversationHistory)
            .catch((err) => console.error("[augure] Ingestion error:", err));
        }

        return response.content;
      }

      this.conversationHistory.push({
        role: "assistant",
        content: response.content || "",
      });

      for (const toolCall of response.toolCalls) {
        const result = await this.config.tools.execute(
          toolCall.name,
          toolCall.arguments,
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

**Step 4: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/core test`
Expected: PASS (all old tests still pass — retriever/ingester are optional)

**Step 5: Commit**

```bash
git add packages/core/src/agent.ts packages/core/src/__tests__/agent.test.ts
git commit -m "feat(core): integrate MemoryRetriever and MemoryIngester into agent loop"
```

---

### Task 10: Heartbeat system

Periodic proactive check-ins using a cheap model to decide if the agent should act.

**Files:**
- Create: `packages/scheduler/src/heartbeat.ts`
- Modify: `packages/scheduler/src/index.ts`
- Test: `packages/scheduler/src/__tests__/heartbeat.test.ts` (create)

**Step 1: Write the failing tests**

Create `packages/scheduler/src/__tests__/heartbeat.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Heartbeat } from "../heartbeat.js";
import type { LLMClient, MemoryStore, Message } from "@augure/types";

function mockLLM(response: string): LLMClient {
  return {
    chat: vi.fn().mockResolvedValue({
      content: response,
      toolCalls: [],
      usage: { inputTokens: 50, outputTokens: 20 },
    }),
  };
}

function mockMemory(files: Record<string, string> = {}): MemoryStore {
  return {
    read: vi.fn(async (path: string) => {
      if (files[path]) return files[path];
      throw new Error("not found");
    }),
    write: vi.fn(),
    append: vi.fn(),
    list: vi.fn().mockResolvedValue(Object.keys(files)),
    exists: vi.fn(async (path: string) => path in files),
  } as unknown as MemoryStore;
}

describe("Heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call the monitor LLM on tick", async () => {
    const llm = mockLLM("ACTION: none");
    const memory = mockMemory({ "observations.md": "- User likes coffee\n" });
    const handler = vi.fn();

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: handler,
    });

    await heartbeat.tick();

    expect(llm.chat).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("should trigger onAction when monitor says ACTION: needed", async () => {
    const llm = mockLLM("ACTION: Check apartment listings on SeLoger for Bordeaux < 1100€");
    const memory = mockMemory({ "observations.md": "- User looking for apartments\n" });
    const handler = vi.fn();

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: handler,
    });

    await heartbeat.tick();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      "Check apartment listings on SeLoger for Bordeaux < 1100€",
    );
  });

  it("should include memory context in LLM call", async () => {
    const llm = mockLLM("ACTION: none");
    const memory = mockMemory({ "observations.md": "- Important fact\n" });

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: vi.fn(),
    });

    await heartbeat.tick();

    const callArgs = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as Message[];
    const systemMsg = callArgs.find((m) => m.role === "system");
    expect(systemMsg?.content).toContain("Important fact");
  });

  it("should start and stop interval", () => {
    const llm = mockLLM("ACTION: none");
    const memory = mockMemory();

    const heartbeat = new Heartbeat({
      llm,
      memory,
      intervalMs: 60_000,
      onAction: vi.fn(),
    });

    heartbeat.start();
    heartbeat.stop();
    // No error = success
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: FAIL — `Heartbeat` does not exist.

**Step 3: Implement Heartbeat**

Create `packages/scheduler/src/heartbeat.ts`:

```typescript
import type { LLMClient, Message, MemoryStore } from "@augure/types";

const HEARTBEAT_PROMPT = `You are a monitoring agent. Your job is to review the user's memory and decide if any proactive action is needed right now.

Review the memory context below and determine:
1. Are there any time-sensitive tasks or reminders?
2. Should the user be notified about something?
3. Are there any scheduled checks that need to run?

If action is needed, respond with:
ACTION: <description of what to do>

If no action is needed, respond with:
ACTION: none

Be concise. Only suggest actions that are clearly needed based on the memory context.`;

export interface HeartbeatConfig {
  llm: LLMClient;
  memory: MemoryStore;
  intervalMs: number;
  onAction: (action: string) => void | Promise<void>;
}

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly config: HeartbeatConfig) {}

  async tick(): Promise<void> {
    const memoryContent = await this.loadMemory();

    const messages: Message[] = [
      { role: "system", content: HEARTBEAT_PROMPT },
      {
        role: "user",
        content: `Current time: ${new Date().toISOString()}\n\n## Memory\n${memoryContent}`,
      },
    ];

    const response = await this.config.llm.chat(messages);
    const action = this.parseAction(response.content);

    if (action && action.toLowerCase() !== "none") {
      await this.config.onAction(action);
    }
  }

  start(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        console.error("[augure] Heartbeat error:", err),
      );
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private parseAction(content: string): string | undefined {
    const match = content.match(/ACTION:\s*(.+)/i);
    return match?.[1]?.trim();
  }

  private async loadMemory(): Promise<string> {
    try {
      const exists = await this.config.memory.exists("observations.md");
      if (exists) {
        return this.config.memory.read("observations.md");
      }
    } catch {
      // Memory not available
    }
    return "(no memory available)";
  }
}
```

**Step 4: Update index.ts**

In `packages/scheduler/src/index.ts`:

```typescript
export { CronScheduler } from "./cron.js";
export { JobStore } from "./jobs.js";
export { Heartbeat } from "./heartbeat.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/scheduler/src/heartbeat.ts packages/scheduler/src/index.ts packages/scheduler/src/__tests__/heartbeat.test.ts
git commit -m "feat(scheduler): add Heartbeat system for proactive monitoring"
```

---

### Task 11: Parse heartbeat interval from config

The config has `heartbeatInterval: "30m"` as a string. We need a parser for this.

**Files:**
- Create: `packages/scheduler/src/interval.ts`
- Test: `packages/scheduler/src/__tests__/interval.test.ts` (create)

**Step 1: Write the failing tests**

Create `packages/scheduler/src/__tests__/interval.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseInterval } from "../interval.js";

describe("parseInterval", () => {
  it("should parse minutes", () => {
    expect(parseInterval("30m")).toBe(30 * 60 * 1000);
  });

  it("should parse hours", () => {
    expect(parseInterval("2h")).toBe(2 * 60 * 60 * 1000);
  });

  it("should parse seconds", () => {
    expect(parseInterval("45s")).toBe(45 * 1000);
  });

  it("should throw on invalid format", () => {
    expect(() => parseInterval("abc")).toThrow();
  });

  it("should throw on zero", () => {
    expect(() => parseInterval("0m")).toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: FAIL

**Step 3: Implement parseInterval**

Create `packages/scheduler/src/interval.ts`:

```typescript
const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

export function parseInterval(input: string): number {
  const match = input.match(/^(\d+)([smh])$/);
  if (!match) {
    throw new Error(`Invalid interval format: "${input}". Expected: <number><s|m|h> (e.g. "30m")`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (value <= 0) {
    throw new Error(`Interval must be positive, got: ${value}`);
  }

  return value * UNITS[unit];
}
```

**Step 4: Update index.ts**

In `packages/scheduler/src/index.ts`:

```typescript
export { CronScheduler } from "./cron.js";
export { JobStore } from "./jobs.js";
export { Heartbeat } from "./heartbeat.js";
export { parseInterval } from "./interval.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build && pnpm --filter @augure/scheduler test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/scheduler/src/interval.ts packages/scheduler/src/index.ts packages/scheduler/src/__tests__/interval.test.ts
git commit -m "feat(scheduler): add parseInterval utility for human-readable durations"
```

---

### Task 12: Wire everything in main.ts

Update the entrypoint to use all M1 features: dynamic memory retrieval, auto-ingestion, job persistence, heartbeat, and multi-model routing.

**Files:**
- Modify: `packages/core/src/main.ts`

**Step 1: Update main.ts**

Replace the full `packages/core/src/main.ts`:

```typescript
import { loadConfig } from "./config.js";
import { OpenRouterClient } from "./llm.js";
import { Agent } from "./agent.js";
import { TelegramChannel } from "@augure/channels";
import { ToolRegistry, memoryReadTool, memoryWriteTool, scheduleTool } from "@augure/tools";
import { FileMemoryStore, MemoryIngester, MemoryRetriever } from "@augure/memory";
import { CronScheduler, JobStore, Heartbeat, parseInterval } from "@augure/scheduler";
import { resolve } from "node:path";

const SYSTEM_PROMPT = `You are Augure, a personal AI assistant. You are proactive, helpful, and concise.
You speak the same language as the user. You have access to tools and persistent memory.
Always be direct and actionable.`;

function resolveLLMClient(
  config: { default: { apiKey: string; model: string; maxTokens: number }; [key: string]: unknown },
  usage: string,
): OpenRouterClient {
  const override = config[usage] as { apiKey?: string; model?: string; maxTokens?: number } | undefined;
  return new OpenRouterClient({
    apiKey: override?.apiKey ?? config.default.apiKey,
    model: override?.model ?? config.default.model,
    maxTokens: override?.maxTokens ?? config.default.maxTokens,
  });
}

export async function startAgent(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  console.log(`[augure] Loaded config: ${config.identity.name}`);

  const llm = resolveLLMClient(config.llm, "default");
  const ingestionLLM = resolveLLMClient(config.llm, "ingestion");
  const monitoringLLM = resolveLLMClient(config.llm, "monitoring");

  const memoryPath = resolve(configPath, "..", config.memory.path);
  const memory = new FileMemoryStore(memoryPath);
  console.log(`[augure] Memory store: ${memoryPath}`);

  const retriever = new MemoryRetriever(memory, {
    maxTokens: config.memory.maxRetrievalTokens,
  });

  const ingester = config.memory.autoIngest
    ? new MemoryIngester(ingestionLLM, memory)
    : undefined;

  const tools = new ToolRegistry();
  tools.register(memoryReadTool);
  tools.register(memoryWriteTool);
  tools.register(scheduleTool);

  const jobStorePath = resolve(configPath, "..", "jobs.json");
  const jobStore = new JobStore(jobStorePath);
  const scheduler = new CronScheduler(jobStore);

  // Load persisted jobs from disk
  await scheduler.loadPersistedJobs();
  console.log(`[augure] Loaded ${scheduler.listJobs().length} persisted jobs`);

  // Add config-defined jobs
  for (const job of config.scheduler.jobs) {
    if (!scheduler.listJobs().some((j) => j.id === job.id)) {
      scheduler.addJob({ ...job, enabled: true });
    }
  }

  tools.setContext({ config, memory, scheduler });

  const agent = new Agent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    memoryContent: "",
    retriever,
    ingester,
  });

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

  // Set up heartbeat
  const heartbeatIntervalMs = parseInterval(config.scheduler.heartbeatInterval);
  const heartbeat = new Heartbeat({
    llm: monitoringLLM,
    memory,
    intervalMs: heartbeatIntervalMs,
    onAction: async (action) => {
      console.log(`[augure] Heartbeat action: ${action}`);
      // Process the heartbeat action through the agent
      const response = await agent.handleMessage({
        id: `heartbeat-${Date.now()}`,
        channelType: "system",
        userId: "system",
        text: `[Heartbeat] ${action}`,
        timestamp: new Date(),
      });
      console.log(`[augure] Heartbeat response: ${response}`);
    },
  });

  scheduler.start();
  heartbeat.start();
  console.log(
    `[augure] Scheduler started with ${scheduler.listJobs().length} jobs. Heartbeat every ${config.scheduler.heartbeatInterval}.`,
  );

  const shutdown = () => {
    console.log("\n[augure] Shutting down...");
    heartbeat.stop();
    scheduler.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const configPath = process.argv[2] ?? "./config/augure.json5";
startAgent(configPath).catch((err) => {
  console.error("[augure] Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Verify build**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build`
Expected: All packages build successfully.

**Step 3: Run all tests**

Run: `cd /Users/alexis/lab/augure && pnpm turbo test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/core/src/main.ts
git commit -m "feat(core): wire M1 features — retrieval, ingestion, heartbeat, job persistence"
```

---

### Task 13: Add channelType "system" to types

The heartbeat sends messages with `channelType: "system"`. This needs to be recognized.

**Files:**
- Modify: `packages/types/src/channels.ts`

**Step 1: Check if IncomingMessage already allows arbitrary channelType**

Read `packages/types/src/channels.ts`. The `channelType` field is a `string`, so it already accepts `"system"`. If it's a union type, add `"system"`.

If it's `string` (which it is based on M0 implementation), no changes needed — skip this task and proceed to Task 14.

---

### Task 14: Final integration — run all tests and verify

**Step 1: Build everything**

Run: `cd /Users/alexis/lab/augure && pnpm turbo build`
Expected: All 8 packages build successfully.

**Step 2: Run all tests**

Run: `cd /Users/alexis/lab/augure && pnpm turbo test`
Expected: All tests pass. Count should be significantly higher than the M0 baseline of 38 tests.

**Step 3: Typecheck**

Run: `cd /Users/alexis/lab/augure && pnpm turbo typecheck`
Expected: No type errors.

**Step 4: Count LOC**

Run: `find packages -name '*.ts' ! -name '*.test.ts' ! -name '*.d.ts' ! -path '*/dist/*' ! -path '*/node_modules/*' | xargs wc -l`
Expected: Still well under the 10K LOC target.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: M1 complete — memory ingestion, retrieval, heartbeat, job persistence"
```
