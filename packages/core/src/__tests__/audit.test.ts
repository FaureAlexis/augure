import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FileAuditLogger,
  NullAuditLogger,
  summarize,
  type AuditEntry,
} from "../audit.js";

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: "2026-01-15T10:00:00.000Z",
    trigger: "user",
    action: "chat",
    inputSummary: "hello",
    outputSummary: "world",
    durationMs: 42,
    success: true,
    ...overrides,
  };
}

describe("FileAuditLogger", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "augure-audit-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("log() writes valid JSONL line", async () => {
    const logger = new FileAuditLogger(tmpDir);
    const entry = makeEntry();
    logger.log(entry);
    await logger.close();

    const content = await readFile(
      join(tmpDir, "actions", "2026-01-15.jsonl"),
      "utf-8",
    );
    const parsed = JSON.parse(content.trim());
    expect(parsed.ts).toBe("2026-01-15T10:00:00.000Z");
    expect(parsed.trigger).toBe("user");
    expect(parsed.action).toBe("chat");
    expect(parsed.inputSummary).toBe("hello");
    expect(parsed.outputSummary).toBe("world");
    expect(parsed.durationMs).toBe(42);
    expect(parsed.success).toBe(true);
  });

  it("date rotation creates separate files", async () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.log(makeEntry({ ts: "2026-01-15T10:00:00.000Z" }));
    logger.log(makeEntry({ ts: "2026-01-16T12:00:00.000Z" }));
    await logger.close();

    const files = await readdir(join(tmpDir, "actions"));
    expect(files.sort()).toEqual(["2026-01-15.jsonl", "2026-01-16.jsonl"]);
  });

  it("close() resolves even with no writes", async () => {
    const logger = new FileAuditLogger(tmpDir);
    await expect(logger.close()).resolves.toBeUndefined();
  });
});

describe("NullAuditLogger", () => {
  it("does not throw", async () => {
    const logger = new NullAuditLogger();
    logger.log(makeEntry());
    await expect(logger.close()).resolves.toBeUndefined();
  });
});

describe("summarize", () => {
  it("returns short text as-is", () => {
    expect(summarize("hello")).toBe("hello");
  });

  it("truncates long text with ellipsis", () => {
    const long = "a".repeat(300);
    const result = summarize(long, 200);
    expect(result.length).toBe(203); // 200 + "..."
    expect(result.endsWith("...")).toBe(true);
    expect(result.slice(0, 200)).toBe("a".repeat(200));
  });
});
