import { Octokit } from "@octokit/rest";
import type { NativeTool, ToolContext, ToolResult } from "@augure/types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getClient(ctx: ToolContext): Octokit | null {
  const token = ctx.config.tools?.github?.token;
  if (!token) return null;
  return new Octokit({ auth: token });
}

function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n... (truncated)";
}

/* ------------------------------------------------------------------ */
/*  Action handler type + dispatch map                                */
/* ------------------------------------------------------------------ */

type ActionHandler = (
  client: Octokit,
  params: Record<string, unknown>,
) => Promise<ToolResult>;

const actions: Record<string, ActionHandler> = {};

/* ------------------------------------------------------------------ */
/*  Tool definition                                                   */
/* ------------------------------------------------------------------ */

export const githubTool: NativeTool = {
  name: "github",
  description:
    "Interact with GitHub: issues, pull requests, repos, releases, and search",
  configCheck: (ctx) =>
    ctx.config.tools?.github?.token
      ? null
      : "This tool requires tools.github.token in your config.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "list_issues",
          "get_issue",
          "create_issue",
          "update_issue",
          "comment_issue",
          "list_prs",
          "get_pr",
          "create_pr",
          "review_pr",
          "merge_pr",
          "list_repos",
          "get_repo",
          "list_releases",
          "create_release",
          "search_issues",
          "search_code",
          "search_repos",
        ],
        description: "The GitHub action to perform",
      },
      owner: { type: "string", description: "Repository owner (user or org)" },
      repo: { type: "string", description: "Repository name" },
      issue_number: { type: "number", description: "Issue number" },
      pull_number: { type: "number", description: "Pull request number" },
      title: { type: "string", description: "Title (for create actions)" },
      body: { type: "string", description: "Body text" },
      state: { type: "string", description: "State filter (open/closed/all)" },
      labels: {
        type: "string",
        description: "Comma-separated labels",
      },
      base: { type: "string", description: "Base branch (for PRs)" },
      head: { type: "string", description: "Head branch (for PRs)" },
      event: {
        type: "string",
        description: "Review event: APPROVE, REQUEST_CHANGES, or COMMENT",
      },
      merge_method: {
        type: "string",
        description: "Merge method: merge, squash, or rebase",
      },
      tag_name: { type: "string", description: "Tag name (for releases)" },
      target_commitish: {
        type: "string",
        description: "Target branch/commit (for releases)",
      },
      draft: { type: "boolean", description: "Whether this is a draft" },
      query: { type: "string", description: "Search query" },
      per_page: { type: "number", description: "Results per page (max 100)" },
    },
    required: ["action"],
  },
  execute: async (params, ctx) => {
    const p = params as Record<string, unknown>;
    const action = p.action as string;

    const client = getClient(ctx);
    if (!client) {
      return {
        success: false,
        output:
          "GitHub token not configured. Set tools.github.token in your config.",
      };
    }

    const handler = actions[action];
    if (!handler) {
      return { success: false, output: `Unknown action: ${action}` };
    }

    try {
      return await handler(client, p);
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export { actions, truncate };
