import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { githubTool } from "../github.js";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

function makeCtx(token?: string): ToolContext {
  return {
    config: {
      tools: token ? { github: { token } } : {},
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("githubTool", () => {
  describe("configCheck", () => {
    it("returns null when token is configured", () => {
      const ctx = makeCtx("ghp_test123");
      expect(githubTool.configCheck!(ctx)).toBeNull();
    });

    it("returns warning when token is missing", () => {
      const ctx = makeCtx();
      const result = githubTool.configCheck!(ctx);
      expect(result).toContain("tools.github.token");
    });
  });

  describe("dispatch", () => {
    it("returns error for unknown action", async () => {
      const ctx = makeCtx("ghp_test123");
      const result = await githubTool.execute({ action: "nope" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown action: nope");
    });

    it("returns error when token is missing", async () => {
      const ctx = makeCtx();
      const result = await githubTool.execute(
        { action: "list_issues", owner: "o", repo: "r" },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.output).toContain("GitHub token not configured");
    });
  });
});
