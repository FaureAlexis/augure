# @augure/scheduler

## 0.1.4

### Patch Changes

- 2f42a7c: fix(scheduler): add structured logging and fix startup order preventing jobs from firing

  - CronScheduler now accepts a `Logger` via `CronSchedulerOptions`, replacing raw `console.log` with the standard `Logger` interface (`info`/`debug`/`warn`/`error`)
  - Added diagnostic warning when a one-shot job is added while the scheduler is not running
  - Added `.catch()` error handling on fire-and-forget promises in cron and one-shot callbacks
  - Fixed critical startup bug: `await tg.start()` (grammY long-polling) blocks forever, so `scheduler.start()`, `heartbeat.start()`, job trigger handlers, shutdown handlers, and update timers were never executed. All setup now runs before the blocking Telegram call.

## 0.1.3

### Patch Changes

- Updated dependencies [d26c70d]
  - @augure/types@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [eae2fe8]
  - @augure/types@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [c0ef3ac]
  - @augure/types@0.2.0

## 0.1.0

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

## 0.0.2

### Patch Changes

- Updated dependencies [7c430c9]
  - @augure/types@0.1.0
