# @augure/types

## 0.5.0

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

## 0.4.0

### Minor Changes

- d26c70d: Add browser automation via Stagehand. New @augure/browser package with BrowserSessionManager.
  Session-based browser NativeTool for LLM with act/extract/observe/screenshot actions.
  Supports local Playwright and Browserbase cloud providers.

## 0.3.0

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

## 0.2.0

### Minor Changes

- c0ef3ac: Add datetime tool, configCheck warnings, and enriched system prompt

  - New `datetime` tool returns current date/time with optional IANA timezone support
  - `NativeTool` gains an optional `configCheck` field: unconfigured tools show a `[NOT CONFIGURED]` warning with a documentation link in their LLM description
  - `assembleContext` now injects the current date and time into every LLM system prompt
  - The system prompt describes available tools and the skills system (conditional on config)
  - `emailTool` is now registered by default (was exported but never wired up)
  - Structured logging via `Logger` interface with `--debug` CLI flag

## 0.1.1

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
