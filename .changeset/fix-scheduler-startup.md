---
"@augure/scheduler": patch
"augure": patch
---

fix(scheduler): add structured logging and fix startup order preventing jobs from firing

- CronScheduler now accepts a `Logger` via `CronSchedulerOptions`, replacing raw `console.log` with the standard `Logger` interface (`info`/`debug`/`warn`/`error`)
- Added diagnostic warning when a one-shot job is added while the scheduler is not running
- Added `.catch()` error handling on fire-and-forget promises in cron and one-shot callbacks
- Fixed critical startup bug: `await tg.start()` (grammY long-polling) blocks forever, so `scheduler.start()`, `heartbeat.start()`, job trigger handlers, shutdown handlers, and update timers were never executed. All setup now runs before the blocking Telegram call.
