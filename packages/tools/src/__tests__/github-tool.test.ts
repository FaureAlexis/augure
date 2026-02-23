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

  describe("issue actions", () => {
    const ctx = makeCtx("ghp_test123");

    function mockOk(data: unknown) {
      mockFetch.mockResolvedValue({
        status: 200,
        url: "https://api.github.com/",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify(data)),
      });
    }

    it("list_issues returns markdown table", async () => {
      mockOk([
        {
          number: 1,
          title: "Bug report",
          state: "open",
          user: { login: "alice" },
          labels: [{ name: "bug" }],
        },
        {
          number: 2,
          title: "Feature request",
          state: "open",
          user: { login: "bob" },
          labels: [],
        },
      ]);
      const result = await githubTool.execute(
        { action: "list_issues", owner: "acme", repo: "app" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("| #1 |");
      expect(result.output).toContain("Bug report");
      expect(result.output).toContain("bug");
      expect(result.output).toContain("| #2 |");
    });

    it("list_issues returns message when empty", async () => {
      mockOk([]);
      const result = await githubTool.execute(
        { action: "list_issues", owner: "acme", repo: "app" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("No issues found");
    });

    it("get_issue returns detailed markdown", async () => {
      mockOk({
        number: 42,
        title: "Fix login",
        state: "open",
        user: { login: "alice" },
        labels: [{ name: "bug" }],
        html_url: "https://github.com/acme/app/issues/42",
        body: "Login is broken",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
        comments: 3,
        assignees: [{ login: "bob" }],
      });
      const result = await githubTool.execute(
        { action: "get_issue", owner: "acme", repo: "app", issue_number: 42 },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("# #42: Fix login");
      expect(result.output).toContain("**State:** open");
      expect(result.output).toContain("bob");
      expect(result.output).toContain("Login is broken");
      expect(result.output).toContain("https://github.com/acme/app/issues/42");
    });

    it("create_issue returns confirmation with URL", async () => {
      mockOk({
        number: 10,
        html_url: "https://github.com/acme/app/issues/10",
      });
      const result = await githubTool.execute(
        {
          action: "create_issue",
          owner: "acme",
          repo: "app",
          title: "New issue",
          body: "Details here",
          labels: "bug, urgent",
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("Created issue #10");
      expect(result.output).toContain("https://github.com/acme/app/issues/10");
    });

    it("update_issue returns confirmation", async () => {
      mockOk({
        number: 10,
        html_url: "https://github.com/acme/app/issues/10",
      });
      const result = await githubTool.execute(
        {
          action: "update_issue",
          owner: "acme",
          repo: "app",
          issue_number: 10,
          state: "closed",
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("Updated issue #10");
    });

    it("comment_issue returns confirmation with URL", async () => {
      mockOk({
        html_url: "https://github.com/acme/app/issues/10#issuecomment-1",
      });
      const result = await githubTool.execute(
        {
          action: "comment_issue",
          owner: "acme",
          repo: "app",
          issue_number: 10,
          body: "Looks good!",
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("Comment added");
      expect(result.output).toContain("issuecomment-1");
    });
  });
});
