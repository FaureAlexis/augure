# GitHub Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `github` NativeTool to `@augure/tools` with 17 actions (issues, PRs, repos, releases, search) using Octokit.

**Architecture:** Single tool with `action` dispatch pattern (like `scheduleTool`). Octokit client instantiated lazily from `ctx.config.tools.github.token`. Each action is a typed handler function. Output is markdown-formatted, truncated to 4000 chars.

**Tech Stack:** `@octokit/rest`, vitest, `vi.stubGlobal("fetch")` for mocking (Octokit uses fetch internally).

**Design doc:** `docs/plans/2026-02-23-github-tool-design.md`

---

### Task 1: Add Octokit dependency

**Files:**
- Modify: `packages/tools/package.json`

**Step 1: Install @octokit/rest**

```bash
cd packages/tools && pnpm add @octokit/rest
```

**Step 2: Verify it installed**

```bash
pnpm --filter @augure/tools exec -- node -e "import('@octokit/rest').then(m => console.log('OK:', Object.keys(m)))"
```

Expected: `OK: [ 'Octokit' ]`

**Step 3: Commit**

```bash
git add packages/tools/package.json pnpm-lock.yaml
git commit -m "chore(tools): add @octokit/rest dependency for GitHub tool"
```

---

### Task 2: Scaffold github.ts with client helper + formatters + configCheck

**Files:**
- Create: `packages/tools/src/github.ts`
- Modify: `packages/tools/src/index.ts` (add export)

**Step 1: Write the test for configCheck and unknown action**

Create `packages/tools/src/__tests__/github-tool.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
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

describe("githubTool", () => {
  describe("configCheck", () => {
    it("should return null when token is configured", () => {
      const ctx = makeCtx("ghp_test123");
      expect(githubTool.configCheck!(ctx)).toBeNull();
    });

    it("should return warning when token is missing", () => {
      const ctx = makeCtx();
      const result = githubTool.configCheck!(ctx);
      expect(result).toContain("tools.github.token");
    });
  });

  describe("dispatch", () => {
    it("should return error for unknown action", async () => {
      const ctx = makeCtx("ghp_test123");
      const result = await githubTool.execute({ action: "unknown_action" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown action");
    });

    it("should return error when token is not configured", async () => {
      const ctx = makeCtx();
      const result = await githubTool.execute({ action: "list_repos" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("not configured");
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: FAIL — `../github.js` does not exist.

**Step 3: Write minimal github.ts scaffold**

Create `packages/tools/src/github.ts`:

```typescript
import { Octokit } from "@octokit/rest";
import type { NativeTool, ToolContext, ToolResult } from "@augure/types";

const MAX_OUTPUT_CHARS = 4000;

function getClient(ctx: ToolContext): Octokit | null {
  const token = ctx.config.tools?.github?.token;
  if (!token) return null;
  return new Octokit({ auth: token });
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + "\n[truncated]";
}

type ActionHandler = (
  client: Octokit,
  params: Record<string, unknown>,
) => Promise<ToolResult>;

const actions: Record<string, ActionHandler> = {};

export const githubTool: NativeTool = {
  name: "github",
  description:
    "Interact with GitHub: manage issues, pull requests, repos, releases, and search. Use the 'action' parameter to specify the operation.",
  configCheck: (ctx) =>
    ctx.config.tools?.github?.token
      ? null
      : "Requires tools.github.token in config. Set GITHUB_TOKEN in your .env",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "list_issues", "get_issue", "create_issue", "update_issue", "comment_issue",
          "list_prs", "get_pr", "create_pr", "review_pr", "merge_pr",
          "list_repos", "get_repo",
          "list_releases", "create_release",
          "search_issues", "search_code", "search_repos",
        ],
        description: "The GitHub action to perform",
      },
      owner: { type: "string", description: "Repository owner (user or org)" },
      repo: { type: "string", description: "Repository name" },
      number: { type: "number", description: "Issue or PR number" },
      title: { type: "string", description: "Title (for create_issue, create_pr, create_release)" },
      body: { type: "string", description: "Body text or comment content" },
      state: { type: "string", enum: ["open", "closed", "all"], description: "Filter by state" },
      labels: { type: "array", items: { type: "string" }, description: "Labels (for issues)" },
      head: { type: "string", description: "Head branch (for create_pr)" },
      base: { type: "string", description: "Base branch (for create_pr)" },
      event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"], description: "Review event (for review_pr)" },
      method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method (for merge_pr)" },
      tag: { type: "string", description: "Tag name (for create_release)" },
      name: { type: "string", description: "Release name (for create_release)" },
      query: { type: "string", description: "Search query (for search_*)" },
    },
    required: ["action"],
  },
  execute: async (params, ctx) => {
    const { action, ...rest } = params as { action: string } & Record<string, unknown>;

    const client = getClient(ctx);
    if (!client) {
      return { success: false, output: "GitHub tool is not configured. Set tools.github.token in your config." };
    }

    const handler = actions[action];
    if (!handler) {
      return { success: false, output: `Unknown action: ${action}` };
    }

    try {
      return await handler(client, rest);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `GitHub API error: ${msg}` };
    }
  },
};
```

**Step 4: Add export to index.ts**

In `packages/tools/src/index.ts`, add:

```typescript
export { githubTool } from "./github.js";
```

**Step 5: Run test to verify it passes**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: PASS (4 tests)

**Step 6: Commit**

```bash
git add packages/tools/src/github.ts packages/tools/src/index.ts packages/tools/src/__tests__/github-tool.test.ts
git commit -m "feat(tools): scaffold github tool with dispatch, configCheck, and client helper"
```

---

### Task 3: Issues actions (list, get, create, update, comment)

**Files:**
- Modify: `packages/tools/src/github.ts` (add 5 action handlers)
- Modify: `packages/tools/src/__tests__/github-tool.test.ts` (add tests)

**Step 1: Write the failing tests for all 5 issue actions**

Append to `packages/tools/src/__tests__/github-tool.test.ts`:

```typescript
import { vi, beforeEach, afterEach } from "vitest";

// Add these at the top-level, after existing imports
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Add inside the main describe("githubTool") block:

  describe("issues", () => {
    it("list_issues should return formatted table", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve([
          { number: 1, title: "Bug fix", state: "open", labels: [{ name: "bug" }], user: { login: "alice" } },
          { number: 2, title: "Feature", state: "open", labels: [], user: { login: "bob" } },
        ]),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "list_issues", owner: "acme", repo: "app" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("#1");
      expect(result.output).toContain("Bug fix");
      expect(result.output).toContain("bug");
    });

    it("get_issue should return issue details", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          number: 42,
          title: "Critical bug",
          state: "open",
          body: "Steps to reproduce...",
          labels: [{ name: "bug" }, { name: "urgent" }],
          user: { login: "alice" },
          html_url: "https://github.com/acme/app/issues/42",
          created_at: "2026-02-20T10:00:00Z",
          comments: 3,
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "get_issue", owner: "acme", repo: "app", number: 42 },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("#42");
      expect(result.output).toContain("Critical bug");
      expect(result.output).toContain("Steps to reproduce");
    });

    it("create_issue should return confirmation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          number: 99,
          html_url: "https://github.com/acme/app/issues/99",
          title: "New issue",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "create_issue", owner: "acme", repo: "app", title: "New issue", body: "Description" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("#99");
      expect(result.output).toContain("https://github.com/acme/app/issues/99");
    });

    it("update_issue should return confirmation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          number: 42,
          html_url: "https://github.com/acme/app/issues/42",
          state: "closed",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "update_issue", owner: "acme", repo: "app", number: 42, state: "closed" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("#42");
      expect(result.output).toContain("updated");
    });

    it("comment_issue should return confirmation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          id: 12345,
          html_url: "https://github.com/acme/app/issues/42#issuecomment-12345",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "comment_issue", owner: "acme", repo: "app", number: 42, body: "Fixed in #43" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Comment added");
    });
  });
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: FAIL — actions are not registered, returns "Unknown action".

**Step 3: Implement the 5 issue action handlers**

Add to `packages/tools/src/github.ts`, before the `export const githubTool` line:

```typescript
// ── Formatters ──────────────────────────────────────────────

function formatIssueRow(issue: { number: number; title: string; state: string; labels: { name: string }[]; user: { login: string } }): string {
  const labels = issue.labels.map((l) => l.name).join(", ") || "—";
  return `| #${issue.number} | ${issue.title} | ${issue.state} | ${labels} | @${issue.user.login} |`;
}

function formatIssueDetail(issue: {
  number: number; title: string; state: string; body: string | null;
  labels: { name: string }[]; user: { login: string };
  html_url: string; created_at: string; comments: number;
}): string {
  const labels = issue.labels.map((l) => l.name).join(", ") || "none";
  return [
    `## #${issue.number}: ${issue.title}`,
    `**State:** ${issue.state} | **Labels:** ${labels} | **By:** @${issue.user.login}`,
    `**Created:** ${issue.created_at} | **Comments:** ${issue.comments}`,
    `**URL:** ${issue.html_url}`,
    "",
    issue.body ?? "_No description._",
  ].join("\n");
}

// ── Issue actions ───────────────────────────────────────────

actions.list_issues = async (client, params) => {
  const { owner, repo, state, labels } = params as {
    owner: string; repo: string; state?: string; labels?: string[];
  };
  const { data } = await client.rest.issues.listForRepo({
    owner,
    repo,
    state: (state as "open" | "closed" | "all") ?? "open",
    labels: labels?.join(","),
    per_page: 30,
  });
  if (data.length === 0) return { success: true, output: "No issues found." };
  const header = "| # | Title | State | Labels | Author |\n|---|-------|-------|--------|--------|";
  const rows = data.map((i) => formatIssueRow(i as Parameters<typeof formatIssueRow>[0]));
  return { success: true, output: truncate(`${header}\n${rows.join("\n")}`) };
};

actions.get_issue = async (client, params) => {
  const { owner, repo, number } = params as { owner: string; repo: string; number: number };
  const { data } = await client.rest.issues.get({ owner, repo, issue_number: number });
  return { success: true, output: truncate(formatIssueDetail(data as Parameters<typeof formatIssueDetail>[0])) };
};

actions.create_issue = async (client, params) => {
  const { owner, repo, title, body, labels } = params as {
    owner: string; repo: string; title: string; body?: string; labels?: string[];
  };
  const { data } = await client.rest.issues.create({ owner, repo, title, body, labels });
  return { success: true, output: `Issue #${data.number} created: ${data.html_url}` };
};

actions.update_issue = async (client, params) => {
  const { owner, repo, number, state, title, body, labels } = params as {
    owner: string; repo: string; number: number;
    state?: string; title?: string; body?: string; labels?: string[];
  };
  const { data } = await client.rest.issues.update({
    owner, repo, issue_number: number,
    ...(state && { state: state as "open" | "closed" }),
    ...(title && { title }),
    ...(body && { body }),
    ...(labels && { labels }),
  });
  return { success: true, output: `Issue #${data.number} updated: ${data.html_url}` };
};

actions.comment_issue = async (client, params) => {
  const { owner, repo, number, body } = params as {
    owner: string; repo: string; number: number; body: string;
  };
  const { data } = await client.rest.issues.createComment({ owner, repo, issue_number: number, body });
  return { success: true, output: `Comment added: ${data.html_url}` };
};
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: PASS (all issue tests + scaffold tests)

**Step 5: Commit**

```bash
git add packages/tools/src/github.ts packages/tools/src/__tests__/github-tool.test.ts
git commit -m "feat(tools): add GitHub issue actions (list, get, create, update, comment)"
```

---

### Task 4: PR actions (list, get, create, review, merge)

**Files:**
- Modify: `packages/tools/src/github.ts` (add 5 action handlers)
- Modify: `packages/tools/src/__tests__/github-tool.test.ts` (add tests)

**Step 1: Write the failing tests for all 5 PR actions**

Append inside the main `describe("githubTool")` block:

```typescript
  describe("pull requests", () => {
    it("list_prs should return formatted table", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve([
          { number: 10, title: "Add feature", state: "open", user: { login: "alice" }, head: { ref: "feat-x" }, base: { ref: "main" } },
        ]),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "list_prs", owner: "acme", repo: "app" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("#10");
      expect(result.output).toContain("Add feature");
      expect(result.output).toContain("feat-x");
    });

    it("get_pr should return PR details with diff stats", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          number: 10,
          title: "Add feature",
          state: "open",
          body: "Implements X",
          user: { login: "alice" },
          html_url: "https://github.com/acme/app/pull/10",
          head: { ref: "feat-x" },
          base: { ref: "main" },
          additions: 50,
          deletions: 10,
          changed_files: 3,
          mergeable: true,
          created_at: "2026-02-20T10:00:00Z",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "get_pr", owner: "acme", repo: "app", number: 10 },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("#10");
      expect(result.output).toContain("+50/-10");
      expect(result.output).toContain("3 files");
    });

    it("create_pr should return confirmation with URL", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          number: 11,
          html_url: "https://github.com/acme/app/pull/11",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "create_pr", owner: "acme", repo: "app", title: "New PR", head: "feat-y", base: "main" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("#11");
      expect(result.output).toContain("https://github.com/acme/app/pull/11");
    });

    it("review_pr should return confirmation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          id: 777,
          html_url: "https://github.com/acme/app/pull/10#pullrequestreview-777",
          state: "APPROVED",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "review_pr", owner: "acme", repo: "app", number: 10, event: "APPROVE", body: "LGTM" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Review submitted");
    });

    it("merge_pr should return confirmation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          merged: true,
          sha: "abc123",
          message: "Pull Request successfully merged",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "merge_pr", owner: "acme", repo: "app", number: 10, method: "squash" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("merged");
    });
  });
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: FAIL — PR actions not registered.

**Step 3: Implement the 5 PR action handlers**

Add to `packages/tools/src/github.ts`:

```typescript
// ── PR formatters ───────────────────────────────────────────

function formatPrRow(pr: {
  number: number; title: string; state: string;
  user: { login: string }; head: { ref: string }; base: { ref: string };
}): string {
  return `| #${pr.number} | ${pr.title} | ${pr.state} | ${pr.head.ref} → ${pr.base.ref} | @${pr.user.login} |`;
}

function formatPrDetail(pr: {
  number: number; title: string; state: string; body: string | null;
  user: { login: string }; html_url: string;
  head: { ref: string }; base: { ref: string };
  additions: number; deletions: number; changed_files: number;
  mergeable: boolean | null; created_at: string;
}): string {
  return [
    `## PR #${pr.number}: ${pr.title}`,
    `**State:** ${pr.state} | **Branch:** ${pr.head.ref} → ${pr.base.ref} | **By:** @${pr.user.login}`,
    `**Diff:** +${pr.additions}/-${pr.deletions} in ${pr.changed_files} files | **Mergeable:** ${pr.mergeable ?? "unknown"}`,
    `**Created:** ${pr.created_at}`,
    `**URL:** ${pr.html_url}`,
    "",
    pr.body ?? "_No description._",
  ].join("\n");
}

// ── PR actions ──────────────────────────────────────────────

actions.list_prs = async (client, params) => {
  const { owner, repo, state } = params as { owner: string; repo: string; state?: string };
  const { data } = await client.rest.pulls.list({
    owner, repo,
    state: (state as "open" | "closed" | "all") ?? "open",
    per_page: 30,
  });
  if (data.length === 0) return { success: true, output: "No pull requests found." };
  const header = "| # | Title | State | Branch | Author |\n|---|-------|-------|--------|--------|";
  const rows = data.map((pr) => formatPrRow(pr));
  return { success: true, output: truncate(`${header}\n${rows.join("\n")}`) };
};

actions.get_pr = async (client, params) => {
  const { owner, repo, number } = params as { owner: string; repo: string; number: number };
  const { data } = await client.rest.pulls.get({ owner, repo, pull_number: number });
  return { success: true, output: truncate(formatPrDetail(data as Parameters<typeof formatPrDetail>[0])) };
};

actions.create_pr = async (client, params) => {
  const { owner, repo, title, head, base, body } = params as {
    owner: string; repo: string; title: string; head: string; base: string; body?: string;
  };
  const { data } = await client.rest.pulls.create({ owner, repo, title, head, base, body });
  return { success: true, output: `PR #${data.number} created: ${data.html_url}` };
};

actions.review_pr = async (client, params) => {
  const { owner, repo, number, event, body } = params as {
    owner: string; repo: string; number: number; event: string; body?: string;
  };
  const { data } = await client.rest.pulls.createReview({
    owner, repo, pull_number: number,
    event: event as "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
    body,
  });
  return { success: true, output: `Review submitted (${data.state}): ${data.html_url}` };
};

actions.merge_pr = async (client, params) => {
  const { owner, repo, number, method } = params as {
    owner: string; repo: string; number: number; method?: string;
  };
  const { data } = await client.rest.pulls.merge({
    owner, repo, pull_number: number,
    merge_method: (method as "merge" | "squash" | "rebase") ?? "merge",
  });
  return { success: true, output: `PR merged (${data.sha.slice(0, 7)}): ${data.message}` };
};
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/tools/src/github.ts packages/tools/src/__tests__/github-tool.test.ts
git commit -m "feat(tools): add GitHub PR actions (list, get, create, review, merge)"
```

---

### Task 5: Repos + Releases actions (list_repos, get_repo, list_releases, create_release)

**Files:**
- Modify: `packages/tools/src/github.ts`
- Modify: `packages/tools/src/__tests__/github-tool.test.ts`

**Step 1: Write the failing tests**

```typescript
  describe("repos", () => {
    it("list_repos should return formatted table", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve([
          { full_name: "acme/app", description: "Main app", stargazers_count: 42, language: "TypeScript", private: false },
          { full_name: "acme/lib", description: null, stargazers_count: 5, language: "Rust", private: true },
        ]),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute({ action: "list_repos" }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain("acme/app");
      expect(result.output).toContain("42");
    });

    it("get_repo should return repo details", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          full_name: "acme/app",
          description: "Main app",
          html_url: "https://github.com/acme/app",
          stargazers_count: 42,
          forks_count: 10,
          open_issues_count: 5,
          language: "TypeScript",
          default_branch: "main",
          private: false,
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "get_repo", owner: "acme", repo: "app" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("acme/app");
      expect(result.output).toContain("42");
      expect(result.output).toContain("main");
    });
  });

  describe("releases", () => {
    it("list_releases should return formatted list", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve([
          { tag_name: "v1.2.0", name: "Release 1.2", published_at: "2026-02-20T10:00:00Z", html_url: "https://github.com/acme/app/releases/tag/v1.2.0" },
        ]),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "list_releases", owner: "acme", repo: "app" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("v1.2.0");
      expect(result.output).toContain("Release 1.2");
    });

    it("create_release should return confirmation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          tag_name: "v2.0.0",
          html_url: "https://github.com/acme/app/releases/tag/v2.0.0",
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "create_release", owner: "acme", repo: "app", tag: "v2.0.0", name: "v2 Launch", body: "Big update" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("v2.0.0");
      expect(result.output).toContain("https://github.com/acme/app/releases/tag/v2.0.0");
    });
  });
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

**Step 3: Implement the 4 handlers**

```typescript
// ── Repo actions ────────────────────────────────────────────

actions.list_repos = async (client, params) => {
  const { owner } = params as { owner?: string };
  const { data } = owner
    ? await client.rest.repos.listForUser({ username: owner, per_page: 30, sort: "updated" })
    : await client.rest.repos.listForAuthenticatedUser({ per_page: 30, sort: "updated" });
  if (data.length === 0) return { success: true, output: "No repositories found." };
  const header = "| Repo | Description | Stars | Language | Private |\n|------|-------------|-------|----------|---------|";
  const rows = data.map((r) =>
    `| ${r.full_name} | ${r.description ?? "—"} | ${r.stargazers_count} | ${r.language ?? "—"} | ${r.private ? "yes" : "no"} |`
  );
  return { success: true, output: truncate(`${header}\n${rows.join("\n")}`) };
};

actions.get_repo = async (client, params) => {
  const { owner, repo } = params as { owner: string; repo: string };
  const { data } = await client.rest.repos.get({ owner, repo });
  const out = [
    `## ${data.full_name}`,
    data.description ?? "_No description._",
    "",
    `**Stars:** ${data.stargazers_count} | **Forks:** ${data.forks_count} | **Issues:** ${data.open_issues_count}`,
    `**Language:** ${data.language ?? "—"} | **Branch:** ${data.default_branch} | **Private:** ${data.private ? "yes" : "no"}`,
    `**URL:** ${data.html_url}`,
  ].join("\n");
  return { success: true, output: out };
};

// ── Release actions ─────────────────────────────────────────

actions.list_releases = async (client, params) => {
  const { owner, repo } = params as { owner: string; repo: string };
  const { data } = await client.rest.repos.listReleases({ owner, repo, per_page: 10 });
  if (data.length === 0) return { success: true, output: "No releases found." };
  const header = "| Tag | Name | Published | URL |\n|-----|------|-----------|-----|";
  const rows = data.map((r) =>
    `| ${r.tag_name} | ${r.name ?? "—"} | ${r.published_at ?? "draft"} | ${r.html_url} |`
  );
  return { success: true, output: truncate(`${header}\n${rows.join("\n")}`) };
};

actions.create_release = async (client, params) => {
  const { owner, repo, tag, name, body } = params as {
    owner: string; repo: string; tag: string; name?: string; body?: string;
  };
  const { data } = await client.rest.repos.createRelease({
    owner, repo, tag_name: tag, name, body,
  });
  return { success: true, output: `Release ${data.tag_name} created: ${data.html_url}` };
};
```

**Step 4: Run tests**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/github.ts packages/tools/src/__tests__/github-tool.test.ts
git commit -m "feat(tools): add GitHub repos and releases actions"
```

---

### Task 6: Search actions (search_issues, search_code, search_repos)

**Files:**
- Modify: `packages/tools/src/github.ts`
- Modify: `packages/tools/src/__tests__/github-tool.test.ts`

**Step 1: Write the failing tests**

```typescript
  describe("search", () => {
    it("search_issues should return formatted results", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          total_count: 2,
          items: [
            { number: 1, title: "Bug A", state: "open", repository_url: "https://api.github.com/repos/acme/app", html_url: "https://github.com/acme/app/issues/1" },
            { number: 5, title: "Bug B", state: "closed", repository_url: "https://api.github.com/repos/acme/lib", html_url: "https://github.com/acme/lib/issues/5" },
          ],
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "search_issues", query: "bug label:critical" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("2 results");
      expect(result.output).toContain("Bug A");
      expect(result.output).toContain("acme/app");
    });

    it("search_code should return formatted results", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          total_count: 1,
          items: [
            { name: "agent.ts", path: "packages/core/src/agent.ts", repository: { full_name: "acme/augure" }, html_url: "https://github.com/acme/augure/blob/main/packages/core/src/agent.ts" },
          ],
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "search_code", query: "handleMessage repo:acme/augure" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("agent.ts");
      expect(result.output).toContain("packages/core/src/agent.ts");
    });

    it("search_repos should return formatted results", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({
          total_count: 1,
          items: [
            { full_name: "acme/augure", description: "AI agent", stargazers_count: 100, language: "TypeScript", html_url: "https://github.com/acme/augure" },
          ],
        }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "search_repos", query: "augure language:typescript" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("acme/augure");
      expect(result.output).toContain("100");
    });
  });
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

**Step 3: Implement the 3 search handlers**

```typescript
// ── Search actions ──────────────────────────────────────────

actions.search_issues = async (client, params) => {
  const { query } = params as { query: string };
  const { data } = await client.rest.search.issuesAndPullRequests({ q: query, per_page: 20 });
  if (data.total_count === 0) return { success: true, output: "No results found." };
  const lines = data.items.map((i) => {
    const repo = i.repository_url.replace("https://api.github.com/repos/", "");
    return `- **${repo}#${i.number}** ${i.title} (${i.state}) — ${i.html_url}`;
  });
  return { success: true, output: truncate(`**${data.total_count} results:**\n\n${lines.join("\n")}`) };
};

actions.search_code = async (client, params) => {
  const { query } = params as { query: string };
  const { data } = await client.rest.search.code({ q: query, per_page: 20 });
  if (data.total_count === 0) return { success: true, output: "No results found." };
  const lines = data.items.map((i) =>
    `- **${i.repository.full_name}** \`${i.path}\` — ${i.html_url}`
  );
  return { success: true, output: truncate(`**${data.total_count} results:**\n\n${lines.join("\n")}`) };
};

actions.search_repos = async (client, params) => {
  const { query } = params as { query: string };
  const { data } = await client.rest.search.repos({ q: query, per_page: 20 });
  if (data.total_count === 0) return { success: true, output: "No results found." };
  const lines = data.items.map((r) =>
    `- **${r.full_name}** — ${r.description ?? "no description"} (${r.stargazers_count} stars, ${r.language ?? "—"}) ${r.html_url}`
  );
  return { success: true, output: truncate(`**${data.total_count} results:**\n\n${lines.join("\n")}`) };
};
```

**Step 4: Run tests**

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/github.ts packages/tools/src/__tests__/github-tool.test.ts
git commit -m "feat(tools): add GitHub search actions (issues, code, repos)"
```

---

### Task 7: Wire into core + error handling test

**Files:**
- Modify: `packages/core/src/main.ts` (register githubTool)
- Modify: `packages/tools/src/__tests__/github-tool.test.ts` (add API error test)

**Step 1: Write the API error test**

```typescript
  describe("error handling", () => {
    it("should return error on GitHub API failure (404)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ message: "Not Found" }),
      });

      const ctx = makeCtx("ghp_test");
      const result = await githubTool.execute(
        { action: "get_repo", owner: "nonexistent", repo: "nope" },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("GitHub API error");
    });
  });
```

**Step 2: Run test — should already pass** (the catch block in execute handles this)

```bash
cd packages/tools && npx vitest run src/__tests__/github-tool.test.ts
```

Expected: PASS

**Step 3: Register githubTool in main.ts**

In `packages/core/src/main.ts`:

1. Add to import: `githubTool` from `@augure/tools`
2. Add after line 138 (`tools.register(opencodeTool)`): `tools.register(githubTool);`

**Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS (no errors)

**Step 5: Run full test suite**

```bash
pnpm test:unit
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add packages/core/src/main.ts packages/tools/src/__tests__/github-tool.test.ts
git commit -m "feat(core): register GitHub tool in agent startup"
```

---

### Task 8: Final verification

**Step 1: Lint**

```bash
pnpm lint
```

Expected: PASS

**Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Full test suite**

```bash
pnpm test:unit
```

Expected: All pass including new github-tool tests.

**Step 4: Build**

```bash
pnpm build
```

Expected: PASS — all packages compile.
