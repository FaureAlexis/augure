# @augure/core

## 0.5.0

### Minor Changes

- 33060dd: Add GitHub tool with 17 actions (issues, PRs, repos, releases, search) via Octokit

### Patch Changes

- Updated dependencies [33060dd]
  - @augure/tools@0.2.0
  - @augure/code-mode@0.1.2

## 0.4.0

### Minor Changes

- eae2fe8: Add code mode — replace N-tool function-calling loop with single TypeScript execution

  - New `@augure/code-mode` package: LLM writes TypeScript that calls typed APIs in a sandbox instead of making individual tool calls
  - Typegen: auto-generates TypeScript declarations from ToolRegistry for the LLM system prompt
  - Bridge: Proxy-based `api.*` object routes calls from sandbox back to host ToolRegistry
  - VM executor: fast default using Node's built-in `vm` module + esbuild transpilation
  - Docker executor: container-based sandbox following SkillRunner pattern
  - AutoExecutor: VM-first with Docker fallback on executor crash
  - New `CodeModeConfig` in types (`runtime: "vm" | "docker" | "auto"`, `timeout`, `memoryLimit`)
  - Agent loop uses single `execute_code` tool when code mode is enabled, falls back to classic tool loop otherwise

### Patch Changes

- Updated dependencies [eae2fe8]
  - @augure/types@0.3.0
  - @augure/channels@0.1.3
  - @augure/code-mode@0.1.1
  - @augure/memory@0.0.5
  - @augure/sandbox@0.1.2
  - @augure/scheduler@0.1.2
  - @augure/skills@0.1.3
  - @augure/tools@0.1.1

## 0.3.0

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
  - @augure/tools@0.1.0
  - @augure/channels@0.1.2
  - @augure/memory@0.0.4
  - @augure/sandbox@0.1.1
  - @augure/scheduler@0.1.1
  - @augure/skills@0.1.2

## 0.2.0

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

### Patch Changes

- Updated dependencies [406b451]
  - @augure/types@0.1.1
  - @augure/scheduler@0.1.0
  - @augure/sandbox@0.1.0
  - @augure/tools@0.0.3
  - @augure/channels@0.1.1
  - @augure/skills@0.1.1
  - @augure/memory@0.0.3

## 0.1.0

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

### Patch Changes

- Updated dependencies [7c430c9]
  - @augure/types@0.1.0
  - @augure/channels@0.1.0
  - @augure/skills@0.1.0
  - @augure/memory@0.0.2
  - @augure/sandbox@0.0.2
  - @augure/scheduler@0.0.2
  - @augure/tools@0.0.2
