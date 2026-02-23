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

  describe("PR actions", () => {
    const ctx = makeCtx("ghp_test123");

    function mockOk(data: unknown) {
      mockFetch.mockResolvedValue({
        status: 200,
        url: "https://api.github.com/",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify(data)),
      });
    }

    it("list_prs returns markdown table", async () => {
      mockOk([
        {
          number: 5,
          title: "Add feature",
          state: "open",
          user: { login: "alice" },
          draft: false,
        },
        {
          number: 6,
          title: "WIP stuff",
          state: "open",
          user: { login: "bob" },
          draft: true,
        },
      ]);
      const result = await githubTool.execute(
        { action: "list_prs", owner: "acme", repo: "app" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("| #5 |");
      expect(result.output).toContain("Add feature");
      expect(result.output).toContain("| #6 |");
      expect(result.output).toContain("(draft)");
    });

    it("list_prs returns message when empty", async () => {
      mockOk([]);
      const result = await githubTool.execute(
        { action: "list_prs", owner: "acme", repo: "app" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("No pull requests found");
    });

    it("get_pr returns detailed markdown", async () => {
      mockOk({
        number: 5,
        title: "Add feature",
        state: "open",
        user: { login: "alice" },
        draft: false,
        html_url: "https://github.com/acme/app/pull/5",
        body: "This adds a feature",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
        merged: false,
        mergeable: true,
        head: { ref: "feature-branch" },
        base: { ref: "main" },
        additions: 50,
        deletions: 10,
        changed_files: 3,
        comments: 2,
        review_comments: 1,
      });
      const result = await githubTool.execute(
        { action: "get_pr", owner: "acme", repo: "app", pull_number: 5 },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("# #5: Add feature");
      expect(result.output).toContain("feature-branch -> main");
      expect(result.output).toContain("+50 -10");
      expect(result.output).toContain("3 files");
      expect(result.output).toContain("https://github.com/acme/app/pull/5");
    });

    it("create_pr returns confirmation with URL", async () => {
      mockOk({
        number: 7,
        html_url: "https://github.com/acme/app/pull/7",
      });
      const result = await githubTool.execute(
        {
          action: "create_pr",
          owner: "acme",
          repo: "app",
          title: "New PR",
          head: "feature",
          base: "main",
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("Created PR #7");
      expect(result.output).toContain("https://github.com/acme/app/pull/7");
    });

    it("review_pr returns confirmation", async () => {
      mockOk({
        state: "APPROVED",
        html_url: "https://github.com/acme/app/pull/5#pullrequestreview-1",
      });
      const result = await githubTool.execute(
        {
          action: "review_pr",
          owner: "acme",
          repo: "app",
          pull_number: 5,
          event: "APPROVE",
          body: "LGTM",
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("Review submitted");
      expect(result.output).toContain("APPROVED");
    });

    it("merge_pr returns confirmation with SHA", async () => {
      mockOk({
        merged: true,
        message: "Pull Request successfully merged",
        sha: "abc123",
      });
      const result = await githubTool.execute(
        {
          action: "merge_pr",
          owner: "acme",
          repo: "app",
          pull_number: 5,
          merge_method: "squash",
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("Merged");
      expect(result.output).toContain("abc123");
    });
  });

  describe("repos + releases actions", () => {
    const ctx = makeCtx("ghp_test123");

    function mockOk(data: unknown) {
      mockFetch.mockResolvedValue({
        status: 200,
        url: "https://api.github.com/",
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify(data)),
      });
    }

    it("list_repos returns markdown table", async () => {
      mockOk([
        {
          full_name: "acme/app",
          description: "Main app",
          stargazers_count: 42,
          language: "TypeScript",
          private: false,
        },
      ]);
      const result = await githubTool.execute(
        { action: "list_repos", owner: "acme" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("acme/app");
      expect(result.output).toContain("Main app");
      expect(result.output).toContain("42");
    });

    it("list_repos without owner lists authenticated user repos", async () => {
      mockOk([
        {
          full_name: "me/my-repo",
          description: "My repo",
          stargazers_count: 1,
          language: "JavaScript",
          private: true,
        },
      ]);
      const result = await githubTool.execute(
        { action: "list_repos" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("me/my-repo");
    });

    it("list_repos returns message when empty", async () => {
      mockOk([]);
      const result = await githubTool.execute(
        { action: "list_repos", owner: "acme" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("No repositories found");
    });

    it("get_repo returns detailed markdown", async () => {
      mockOk({
        full_name: "acme/app",
        description: "Main application",
        stargazers_count: 42,
        forks_count: 5,
        open_issues_count: 10,
        language: "TypeScript",
        default_branch: "main",
        private: false,
        topics: ["web", "api"],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        html_url: "https://github.com/acme/app",
      });
      const result = await githubTool.execute(
        { action: "get_repo", owner: "acme", repo: "app" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("# acme/app");
      expect(result.output).toContain("Main application");
      expect(result.output).toContain("**Stars:** 42");
      expect(result.output).toContain("web, api");
      expect(result.output).toContain("https://github.com/acme/app");
    });

    it("list_releases returns markdown table", async () => {
      mockOk([
        {
          tag_name: "v1.0.0",
          name: "First release",
          draft: false,
          prerelease: false,
          published_at: "2025-01-01T00:00:00Z",
          html_url: "https://github.com/acme/app/releases/tag/v1.0.0",
        },
      ]);
      const result = await githubTool.execute(
        { action: "list_releases", owner: "acme", repo: "app" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("v1.0.0");
      expect(result.output).toContain("First release");
    });

    it("list_releases returns message when empty", async () => {
      mockOk([]);
      const result = await githubTool.execute(
        { action: "list_releases", owner: "acme", repo: "app" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("No releases found");
    });

    it("create_release returns confirmation with URL", async () => {
      mockOk({
        tag_name: "v2.0.0",
        html_url: "https://github.com/acme/app/releases/tag/v2.0.0",
      });
      const result = await githubTool.execute(
        {
          action: "create_release",
          owner: "acme",
          repo: "app",
          tag_name: "v2.0.0",
          title: "Version 2",
          body: "Big update",
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("Created release v2.0.0");
      expect(result.output).toContain("https://github.com/acme/app/releases/tag/v2.0.0");
    });
  });
});
