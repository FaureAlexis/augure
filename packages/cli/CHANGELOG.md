# augure

## 0.9.0

### Minor Changes

- 8a71557: Add CLI subcommands and MCP server

  **CLI:**

  - `augure stop` — graceful daemon shutdown via PID file
  - `augure status` — read-only overview (PID, config, memory, jobs, channels, Docker, skills)
  - `augure doctor` — validate config, Docker, LLM, and Telegram connectivity
  - `augure memory list|show|edit` — inspect and edit memory files
  - `augure jobs list|add|remove|run` — manage scheduled jobs
  - `augure channels status` — check channel connectivity
  - `augure tools list|test` — inspect and test registered tools
  - `augure mcp` — standalone MCP server (stdio transport)
  - `augure start --daemon` — run agent as background daemon with PID file
  - `augure start --mcp` — enable MCP HTTP server alongside the agent

  **MCP Server:**

  - Tool bridge: all registered Augure tools exposed as MCP tools (including browser and skill tools)
  - Resources: memory files (`memory://`) and scheduled jobs (`jobs://`)
  - Prompts: persona system exposed as MCP prompts
  - Transports: stdio (for Claude Desktop/Cursor) and HTTP (StreamableHTTP on configurable port)
  - Path traversal protection on memory resource reads

  **Types:**

  - Added `McpConfig` interface (`enabled`, `port`)
  - Added `mcp?` field to `AppConfig`

## 0.8.0

### Minor Changes

- c19fca6: Add tiered approval for high-risk tools and file-based Docker bridge for code-mode tool calls.

  **Tiered Approval:**

  - New `riskLevel` field on `NativeTool` — tools marked `"high"` require explicit user approval
  - Channel-agnostic `ApprovalGate` with timeout auto-reject and fallback auto-approve
  - Telegram implementation using InlineKeyboard approve/reject buttons
  - `sandbox_exec`, `opencode`, and `manage_skill` marked as high-risk
  - Configurable via `approval.enabled` and `approval.timeoutMs` in augure.json5

  **Docker Code-Mode Bridge:**

  - Real tool execution from Docker containers via file-based bridge
  - Container harness writes `.bridge-req-{id}.json`, host polls and responds with `.bridge-resp-{id}.json`
  - 120s timeout prevents infinite poll inside container
  - Atomic temp+mv writes avoid partial reads

## 0.7.2

### Patch Changes

- 2f42a7c: fix(scheduler): add structured logging and fix startup order preventing jobs from firing

  - CronScheduler now accepts a `Logger` via `CronSchedulerOptions`, replacing raw `console.log` with the standard `Logger` interface (`info`/`debug`/`warn`/`error`)
  - Added diagnostic warning when a one-shot job is added while the scheduler is not running
  - Added `.catch()` error handling on fire-and-forget promises in cron and one-shot callbacks
  - Fixed critical startup bug: `await tg.start()` (grammY long-polling) blocks forever, so `scheduler.start()`, `heartbeat.start()`, job trigger handlers, shutdown handlers, and update timers were never executed. All setup now runs before the blocking Telegram call.

## 0.7.1

### Patch Changes

- d26c70d: Add browser automation via Stagehand. New @augure/browser package with BrowserSessionManager.
  Session-based browser NativeTool for LLM with act/extract/observe/screenshot actions.
  Supports local Playwright and Browserbase cloud providers.

## 0.7.0

### Minor Changes

- 1f2df3d: Add GitHub tool with 17 actions (issues, PRs, repos, releases, search) via Octokit

## 0.6.1

### Patch Changes

- 51f00d2: Add LLM call latency and per-message token/performance summary logs

## 0.6.0

### Minor Changes

- 5d7e392: Add code mode support — LLM writes TypeScript calling typed APIs in a sandbox instead of individual tool calls

## 0.5.0

### Minor Changes

- 406b451: ### Scheduler: one-shot jobs with `runAt`

  Jobs can now use an ISO 8601 `runAt` field instead of `cron` for one-shot scheduling. One-shot jobs fire once via `setTimeout` and are automatically removed after execution. Expired jobs are discarded on load.

  ### Sandbox: auto-build Docker image

  The sandbox Docker image is now built automatically at startup if it doesn't exist locally, removing the need for manual `docker build` setup.

  ### Core: startup auto-updates and job dispatch

  - Skill auto-update checks run at startup and periodically via `SkillUpdater`
  - CLI version check at startup with optional periodic Telegram notifications
  - Scheduled job triggers are dispatched to the agent and forwarded to Telegram
  - `VersionChecker` simplified: removed `githubRepo`, handles `v`-prefixed and pre-release versions

  ### Fixes

  - **core**: malformed tool call arguments from LLM no longer crash the agent loop (graceful fallback to `{}`)
  - **channels**: `GrammyError.error_code` is now detected in retry logic alongside `status`
  - **skills**: `SkillUpdater` rejects downloaded skills with `sandbox: false` (defense-in-depth)

## 0.4.0

### Minor Changes

- 7c430c9: Telegram channel overhaul and auto-update system

  **Channels:**

  - Add middleware pipeline (Koa-style) for outgoing messages: split, escape, retry
  - Refactor TelegramChannel with MarkdownV2 support, media handling (photos & documents), and plaintext fallback
  - Per-userId conversation isolation to prevent cross-talk
  - Graceful bot shutdown on SIGINT/SIGTERM
  - Custom `rejectMessage` for unauthorized users
  - Move `FunctionSchema` to `@augure/types` for proper layering; pass tools via LLM API instead of system prompt

  **Auto-updates:**

  - Add `UpdatesConfig` type for skill and CLI update settings
  - Add `SkillUpdater` for auto-updating hub skills with test-and-rollback
  - Add `VersionChecker` for CLI update notifications via npm registry

  **CLI:**

  - Add `--env` / `-e` flag for custom `.env` file path

  **Docs:**

  - Add channels overview and Telegram setup guide to Fumadocs site

## 0.3.0

### Minor Changes

- 5be48b4: Bundle CLI with tsup for standalone npm distribution, add email tool (IMAP/SMTP), and add changelog + CLI reference to docs.

## 0.2.0

### Minor Changes

- 00fae0e: Initial release: CLI with `augure start` and `augure init` commands, npm publishing pipeline with changesets, and GitHub Actions CI/CD.
