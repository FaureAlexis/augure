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
/*  Issue formatters                                                  */
/* ------------------------------------------------------------------ */

interface IssueRow {
  number: number;
  title: string;
  state: string;
  user: { login: string } | null;
  labels: { name: string }[];
}

interface IssueDetail extends IssueRow {
  html_url: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  comments: number;
  assignees: { login: string }[];
}

function formatIssueRow(i: IssueRow): string {
  const labels = i.labels.map((l) => l.name).join(", ");
  return `| #${i.number} | ${i.title} | ${i.state} | ${i.user?.login ?? ""} | ${labels} |`;
}

function formatIssueDetail(i: IssueDetail): string {
  const assignees = i.assignees.map((a) => a.login).join(", ") || "none";
  const labels = i.labels.map((l) => l.name).join(", ") || "none";
  return [
    `# #${i.number}: ${i.title}`,
    `**State:** ${i.state}  **Author:** ${i.user?.login ?? "unknown"}`,
    `**Assignees:** ${assignees}  **Labels:** ${labels}`,
    `**Comments:** ${i.comments}  **Created:** ${i.created_at}  **Updated:** ${i.updated_at}`,
    `**URL:** ${i.html_url}`,
    "",
    i.body ?? "_No description_",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Issue actions                                                     */
/* ------------------------------------------------------------------ */

actions.list_issues = async (client, params) => {
  const { owner, repo, state, labels, per_page } = params as {
    owner: string;
    repo: string;
    state?: string;
    labels?: string;
    per_page?: number;
  };
  const { data } = await client.issues.listForRepo({
    owner,
    repo,
    state: (state as "open" | "closed" | "all") ?? "open",
    labels,
    per_page: per_page ?? 30,
  });
  if (data.length === 0) {
    return { success: true, output: "No issues found." };
  }
  const header = "| # | Title | State | Author | Labels |\n|---|-------|-------|--------|--------|";
  const rows = data.map((i) => formatIssueRow(i as unknown as IssueRow));
  return { success: true, output: truncate(`${header}\n${rows.join("\n")}`) };
};

actions.get_issue = async (client, params) => {
  const { owner, repo, issue_number } = params as {
    owner: string;
    repo: string;
    issue_number: number;
  };
  const { data } = await client.issues.get({
    owner,
    repo,
    issue_number,
  });
  return {
    success: true,
    output: truncate(formatIssueDetail(data as unknown as IssueDetail)),
  };
};

actions.create_issue = async (client, params) => {
  const { owner, repo, title, body, labels } = params as {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string;
  };
  const { data } = await client.issues.create({
    owner,
    repo,
    title,
    body,
    labels: labels ? labels.split(",").map((l) => l.trim()) : undefined,
  });
  return {
    success: true,
    output: `Created issue #${data.number}: ${data.html_url}`,
  };
};

actions.update_issue = async (client, params) => {
  const { owner, repo, issue_number, title, body, state, labels } = params as {
    owner: string;
    repo: string;
    issue_number: number;
    title?: string;
    body?: string;
    state?: string;
    labels?: string;
  };
  const { data } = await client.issues.update({
    owner,
    repo,
    issue_number,
    title,
    body,
    state: state as "open" | "closed" | undefined,
    labels: labels ? labels.split(",").map((l) => l.trim()) : undefined,
  });
  return {
    success: true,
    output: `Updated issue #${data.number}: ${data.html_url}`,
  };
};

actions.comment_issue = async (client, params) => {
  const { owner, repo, issue_number, body } = params as {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  };
  const { data } = await client.issues.createComment({
    owner,
    repo,
    issue_number,
    body,
  });
  return {
    success: true,
    output: `Comment added: ${data.html_url}`,
  };
};

/* ------------------------------------------------------------------ */
/*  PR formatters                                                     */
/* ------------------------------------------------------------------ */

interface PrRow {
  number: number;
  title: string;
  state: string;
  user: { login: string } | null;
  draft: boolean;
}

interface PrDetail extends PrRow {
  html_url: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  merged: boolean;
  mergeable: boolean | null;
  head: { ref: string };
  base: { ref: string };
  additions: number;
  deletions: number;
  changed_files: number;
  comments: number;
  review_comments: number;
}

function formatPrRow(pr: PrRow): string {
  const d = pr.draft ? " (draft)" : "";
  return `| #${pr.number} | ${pr.title}${d} | ${pr.state} | ${pr.user?.login ?? ""} |`;
}

function formatPrDetail(pr: PrDetail): string {
  const d = pr.draft ? " (draft)" : "";
  return [
    `# #${pr.number}: ${pr.title}${d}`,
    `**State:** ${pr.state}  **Author:** ${pr.user?.login ?? "unknown"}  **Merged:** ${pr.merged}`,
    `**Branch:** ${pr.head.ref} -> ${pr.base.ref}`,
    `**Changes:** +${pr.additions} -${pr.deletions} in ${pr.changed_files} files`,
    `**Comments:** ${pr.comments} general, ${pr.review_comments} review`,
    `**Created:** ${pr.created_at}  **Updated:** ${pr.updated_at}`,
    `**URL:** ${pr.html_url}`,
    "",
    pr.body ?? "_No description_",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  PR actions                                                        */
/* ------------------------------------------------------------------ */

actions.list_prs = async (client, params) => {
  const { owner, repo, state, per_page } = params as {
    owner: string;
    repo: string;
    state?: string;
    per_page?: number;
  };
  const { data } = await client.pulls.list({
    owner,
    repo,
    state: (state as "open" | "closed" | "all") ?? "open",
    per_page: per_page ?? 30,
  });
  if (data.length === 0) {
    return { success: true, output: "No pull requests found." };
  }
  const header = "| # | Title | State | Author |\n|---|-------|-------|--------|";
  const rows = data.map((pr) => formatPrRow(pr as unknown as PrRow));
  return { success: true, output: truncate(`${header}\n${rows.join("\n")}`) };
};

actions.get_pr = async (client, params) => {
  const { owner, repo, pull_number } = params as {
    owner: string;
    repo: string;
    pull_number: number;
  };
  const { data } = await client.pulls.get({
    owner,
    repo,
    pull_number,
  });
  return {
    success: true,
    output: truncate(formatPrDetail(data as unknown as PrDetail)),
  };
};

actions.create_pr = async (client, params) => {
  const { owner, repo, title, body, head, base, draft } = params as {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    head: string;
    base: string;
    draft?: boolean;
  };
  const { data } = await client.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
    draft,
  });
  return {
    success: true,
    output: `Created PR #${data.number}: ${data.html_url}`,
  };
};

actions.review_pr = async (client, params) => {
  const { owner, repo, pull_number, event, body } = params as {
    owner: string;
    repo: string;
    pull_number: number;
    event: string;
    body?: string;
  };
  const { data } = await client.pulls.createReview({
    owner,
    repo,
    pull_number,
    event: event as "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
    body,
  });
  return {
    success: true,
    output: `Review submitted (${data.state}): ${data.html_url}`,
  };
};

actions.merge_pr = async (client, params) => {
  const { owner, repo, pull_number, merge_method } = params as {
    owner: string;
    repo: string;
    pull_number: number;
    merge_method?: string;
  };
  const { data } = await client.pulls.merge({
    owner,
    repo,
    pull_number,
    merge_method: (merge_method as "merge" | "squash" | "rebase") ?? "merge",
  });
  return {
    success: true,
    output: `Merged: ${data.message} (SHA: ${data.sha})`,
  };
};

/* ------------------------------------------------------------------ */
/*  Repos + Releases actions                                          */
/* ------------------------------------------------------------------ */

interface RepoRow {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  private: boolean;
}

interface RepoDetail extends RepoRow {
  html_url: string;
  default_branch: string;
  open_issues_count: number;
  forks_count: number;
  created_at: string | null;
  updated_at: string | null;
  topics: string[];
}

interface ReleaseRow {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
}

actions.list_repos = async (client, params) => {
  const { owner, per_page } = params as {
    owner?: string;
    per_page?: number;
  };
  const { data } = owner
    ? await client.repos.listForUser({ username: owner, per_page: per_page ?? 30 })
    : await client.repos.listForAuthenticatedUser({ per_page: per_page ?? 30 });
  if (data.length === 0) {
    return { success: true, output: "No repositories found." };
  }
  const header = "| Repository | Description | Stars | Language | Private |\n|------------|-------------|-------|----------|---------|\n";
  const rows = (data as unknown as RepoRow[]).map(
    (r) =>
      `| ${r.full_name} | ${r.description ?? ""} | ${r.stargazers_count} | ${r.language ?? ""} | ${r.private} |`,
  );
  return { success: true, output: truncate(`${header}${rows.join("\n")}`) };
};

actions.get_repo = async (client, params) => {
  const { owner, repo } = params as { owner: string; repo: string };
  const { data } = await client.repos.get({ owner, repo });
  const r = data as unknown as RepoDetail;
  const topics = r.topics.length > 0 ? r.topics.join(", ") : "none";
  const out = [
    `# ${r.full_name}`,
    r.description ?? "_No description_",
    "",
    `**Stars:** ${r.stargazers_count}  **Forks:** ${r.forks_count}  **Open issues:** ${r.open_issues_count}`,
    `**Language:** ${r.language ?? "N/A"}  **Default branch:** ${r.default_branch}  **Private:** ${r.private}`,
    `**Topics:** ${topics}`,
    `**Created:** ${r.created_at}  **Updated:** ${r.updated_at}`,
    `**URL:** ${r.html_url}`,
  ].join("\n");
  return { success: true, output: truncate(out) };
};

actions.list_releases = async (client, params) => {
  const { owner, repo, per_page } = params as {
    owner: string;
    repo: string;
    per_page?: number;
  };
  const { data } = await client.repos.listReleases({
    owner,
    repo,
    per_page: per_page ?? 10,
  });
  if (data.length === 0) {
    return { success: true, output: "No releases found." };
  }
  const header = "| Tag | Name | Draft | Prerelease | Published |\n|-----|------|-------|------------|-----------|";
  const rows = (data as unknown as ReleaseRow[]).map(
    (r) =>
      `| ${r.tag_name} | ${r.name ?? ""} | ${r.draft} | ${r.prerelease} | ${r.published_at ?? ""} |`,
  );
  return { success: true, output: truncate(`${header}\n${rows.join("\n")}`) };
};

actions.create_release = async (client, params) => {
  const { owner, repo, tag_name, title, body, target_commitish, draft } =
    params as {
      owner: string;
      repo: string;
      tag_name: string;
      title?: string;
      body?: string;
      target_commitish?: string;
      draft?: boolean;
    };
  const { data } = await client.repos.createRelease({
    owner,
    repo,
    tag_name,
    name: title,
    body,
    target_commitish,
    draft,
  });
  return {
    success: true,
    output: `Created release ${data.tag_name}: ${data.html_url}`,
  };
};

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
