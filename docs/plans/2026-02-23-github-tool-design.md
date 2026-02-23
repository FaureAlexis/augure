# GitHub Tool — Design

## Overview

A single `github` NativeTool in `packages/tools/src/github.ts` providing full CRUD operations on GitHub via an `action` dispatch pattern. Uses `@octokit/rest` for typed API calls, pagination, and rate limit handling.

## Decisions

- **1 tool, N actions** — Single `github` tool with `action` param (like `schedule` tool). Fewer schemas for the LLM, easier to maintain.
- **Octokit** — `@octokit/rest` as HTTP client. Full typing, auto-pagination, rate limit handling. Worth the dep for a tool this broad.
- **Scope: Core + Releases + Search** — 17 actions across 5 groups.

## Actions (17 total)

### Issues (5)
| Action | Params | Octokit method |
|--------|--------|----------------|
| `list_issues` | owner, repo, state?, labels? | `issues.listForRepo()` |
| `get_issue` | owner, repo, number | `issues.get()` |
| `create_issue` | owner, repo, title, body?, labels? | `issues.create()` |
| `update_issue` | owner, repo, number, state?, title?, body?, labels? | `issues.update()` |
| `comment_issue` | owner, repo, number, body | `issues.createComment()` |

### Pull Requests (5)
| Action | Params | Octokit method |
|--------|--------|----------------|
| `list_prs` | owner, repo, state? | `pulls.list()` |
| `get_pr` | owner, repo, number | `pulls.get()` |
| `create_pr` | owner, repo, title, head, base, body? | `pulls.create()` |
| `review_pr` | owner, repo, number, event, body? | `pulls.createReview()` |
| `merge_pr` | owner, repo, number, method? | `pulls.merge()` |

### Repos (2)
| Action | Params | Octokit method |
|--------|--------|----------------|
| `list_repos` | owner? | `repos.listForAuthenticatedUser()` |
| `get_repo` | owner, repo | `repos.get()` |

### Releases (2)
| Action | Params | Octokit method |
|--------|--------|----------------|
| `list_releases` | owner, repo | `repos.listReleases()` |
| `create_release` | owner, repo, tag, name?, body? | `repos.createRelease()` |

### Search (3)
| Action | Params | Octokit method |
|--------|--------|----------------|
| `search_issues` | query | `search.issuesAndPullRequests()` |
| `search_code` | query | `search.code()` |
| `search_repos` | query | `search.repos()` |

## Architecture

```
githubTool.execute({ action, ...params })
    │
    ▼
 getClient(ctx)  ← lazy Octokit instantiation from ctx.config.tools.github.token
    │
    ▼
 dispatch[action](client, params)  ← typed handler per action
    │
    ▼
 format(result) → ToolResult { success, output }  ← markdown, truncated to 4000 chars
```

## Config

Already in `ToolsConfig`:
```typescript
github?: { token: string }
```

Token injected via `${GITHUB_TOKEN}` in augure.json5.

## Output Format

Each action returns markdown-formatted output truncated at 4000 chars:
- Lists → markdown table (`| #42 | title | state | labels |`)
- Single items → title + body + metadata
- Search → results with path/snippet
- Mutations → confirmation message with link

## Dependencies

- `@octokit/rest` added to `packages/tools/package.json`

## Testing

`packages/tools/src/__tests__/github.test.ts` with MSW mocking GitHub REST API.
- Happy path for each action
- Error cases: missing token, repo not found, rate limit (403)
- Output formatting and truncation
