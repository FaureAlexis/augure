import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpTool } from "../http.js";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

function makeCtx(httpConfig?: ToolContext["config"]["tools"]["http"]): ToolContext {
  return {
    config: { tools: { http: httpConfig } } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
  };
}

function mockResponse(overrides: Partial<{
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  body: string;
}> = {}) {
  const {
    ok = true,
    status = 200,
    statusText = "OK",
    contentType = "application/json",
    body = '{"data":"hello"}',
  } = overrides;

  return {
    ok,
    status,
    statusText,
    headers: {
      get: (name: string) => (name === "content-type" ? contentType : null),
    },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

describe("httpTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should perform a simple GET", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse()));
    const ctx = makeCtx();
    const result = await httpTool.execute({ method: "GET", url: "https://api.example.com/data" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Status: 200 OK");
    expect(result.output).toContain('{"data":"hello"}');
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("should POST with JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse()));
    const ctx = makeCtx();
    const body = { key: "value" };
    const result = await httpTool.execute(
      { method: "POST", url: "https://api.example.com/submit", body },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/submit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("should inject preset baseUrl and headers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse()));
    const ctx = makeCtx({
      presets: {
        github: {
          baseUrl: "https://api.github.com",
          headers: { Authorization: "Bearer gh-token" },
        },
      },
    });

    const result = await httpTool.execute(
      { method: "GET", url: "/repos/owner/repo", preset: "github" },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer gh-token" }),
      }),
    );
  });

  it("should return error for unknown preset", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const ctx = makeCtx();
    const result = await httpTool.execute(
      { method: "GET", url: "/path", preset: "nonexistent" },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain("nonexistent");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should reject DELETE method", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const ctx = makeCtx();
    const result = await httpTool.execute(
      { method: "DELETE", url: "https://api.example.com/resource" },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.output).toBe("Only GET or POST methods are allowed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should truncate large responses", async () => {
    const largeBody = "x".repeat(5000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ body: largeBody })));
    const ctx = makeCtx();
    const result = await httpTool.execute({ method: "GET", url: "https://example.com" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("[truncated]");
    expect(result.output.length).toBeLessThan(largeBody.length + 200);
  });

  it("should return error on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const ctx = makeCtx();
    const result = await httpTool.execute({ method: "GET", url: "https://example.com" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toBe("Network error");
  });

  it("should abort on timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
      ),
    );
    const ctx = makeCtx({ timeoutMs: 1 });
    const result = await httpTool.execute({ method: "GET", url: "https://slow.example.com" }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toContain("aborted");
  });

  it("should truncate at maxResponseBytes", async () => {
    const largeBody = "a".repeat(2000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ body: largeBody })));
    const ctx = makeCtx({ maxResponseBytes: 100 });
    const result = await httpTool.execute({ method: "GET", url: "https://example.com" }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain("[response truncated at byte limit]");
  });
});
