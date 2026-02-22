---
"@augure/types": minor
"@augure/channels": minor
"@augure/core": minor
"@augure/skills": minor
"augure": minor
---

Telegram channel overhaul and auto-update system

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
