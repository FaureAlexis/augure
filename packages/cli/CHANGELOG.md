# augure

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
