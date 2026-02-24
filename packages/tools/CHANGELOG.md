# @augure/tools

## 0.4.0

### Minor Changes

- d26c70d: Add browser automation via Stagehand. New @augure/browser package with BrowserSessionManager.
  Session-based browser NativeTool for LLM with act/extract/observe/screenshot actions.
  Supports local Playwright and Browserbase cloud providers.

### Patch Changes

- Updated dependencies [d26c70d]
  - @augure/types@0.4.0
  - @augure/browser@0.1.1

## 0.3.0

### Minor Changes

- 1f2df3d: Add GitHub tool with 17 actions (issues, PRs, repos, releases, search) via Octokit

## 0.2.0

### Minor Changes

- 33060dd: Add GitHub tool with 17 actions (issues, PRs, repos, releases, search) via Octokit

## 0.1.1

### Patch Changes

- Updated dependencies [eae2fe8]
  - @augure/types@0.3.0

## 0.1.0

### Minor Changes

- c0ef3ac: Add datetime tool, configCheck warnings, and enriched system prompt

  - New `datetime` tool returns current date/time with optional IANA timezone support
  - `NativeTool` gains an optional `configCheck` field: unconfigured tools show a `[NOT CONFIGURED]` warning with a documentation link in their LLM description
  - `assembleContext` now injects the current date and time into every LLM system prompt
  - The system prompt describes available tools and the skills system (conditional on config)
  - `emailTool` is now registered by default (was exported but never wired up)
  - Structured logging via `Logger` interface with `--debug` CLI flag

### Patch Changes

- Updated dependencies [c0ef3ac]
  - @augure/types@0.2.0

## 0.0.3

### Patch Changes

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

- Updated dependencies [406b451]
  - @augure/types@0.1.1

## 0.0.2

### Patch Changes

- Updated dependencies [7c430c9]
  - @augure/types@0.1.0
