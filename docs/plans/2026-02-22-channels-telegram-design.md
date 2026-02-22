# Channels & Telegram Improvements — Design Document

**Date:** 2026-02-22
**Scope:** Improve `@augure/channels` package + add Fumadocs documentation

## Context

The current Telegram channel implementation is a 67-line thin adapter. It works for basic text chat but has several production issues and no documentation.

## Decisions

- **Approach:** Middleware layer — reusable middleware pipeline for message processing (splitting, escaping, error handling) to prepare for multi-channel support.
- **Conversation isolation:** Per-userId `Map<string, Message[]>` in Agent.
- **Media support:** Photos + Documents (no voice/stickers for now).
- **Documentation:** New `channels/` section in Fumadocs with overview + Telegram guide.

---

## 1. Package Structure

```
packages/channels/src/
  middleware/
    split-message.ts     — split messages exceeding channel limit into chunks
    escape-markdown.ts   — escape MarkdownV2 special characters
    error-handler.ts     — bot.catch() + retry with exponential backoff
  telegram/
    telegram.ts          — TelegramChannel class (reception + sending)
    media.ts             — photo/document handlers
  types.ts               — ChannelMiddleware interface
  pipeline.ts            — compose middlewares into an outgoing pipeline
  index.ts               — barrel exports
```

## 2. Middleware Interface

```typescript
// Outgoing middleware — transforms message before sending
interface OutgoingMiddleware {
  (message: OutgoingMessage, next: () => Promise<void>): Promise<void>;
}
```

Pipeline applies middlewares in order: escape markdown → split message → send.

## 3. Seven Fixes

### Fix 1 — Message Splitting (`split-message.ts`)

- Telegram limit: 4096 characters per message.
- Split at paragraph/line boundaries (never mid-word).
- Preserve code blocks: if a split falls inside a fenced block, close and reopen it.
- Send chunks sequentially with 50ms delay.
- Configurable `maxLength` (default 4096).

### Fix 2 — Markdown Safe (`escape-markdown.ts`)

- Switch from `parse_mode: "Markdown"` (legacy) to `parse_mode: "MarkdownV2"`.
- Escape special characters outside code blocks: `_ * [ ] ( ) ~ \` > # + - = | { } . !`
- Preserve intentional LLM formatting (bold, italic, code).
- Fallback: if `sendMessage` fails with MarkdownV2, retry as plaintext.

### Fix 3 — Graceful Shutdown

Add `telegram.stop()` in `main.ts` shutdown handler:

```typescript
const shutdown = async () => {
  heartbeat.stop();
  scheduler.stop();
  if (telegram) await telegram.stop();  // added
  await pool.destroyAll();
  await audit.close();
};
```

### Fix 4 — Error Handling (`error-handler.ts`)

- Register `bot.catch()` in TelegramChannel constructor.
- Structured logging of grammY errors.
- Retry with exponential backoff on 429 (rate limit) and network errors.
- Max 3 retries.

### Fix 5 — Media Support (Photos + Documents)

Extend `IncomingMessage` in `@augure/types`:

```typescript
attachments?: Array<{
  type: "photo" | "document";
  fileId: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
}>;
```

In `telegram/media.ts`:
- `message:photo` handler → pick highest resolution, add attachment.
- `message:document` handler → add attachment with name/mime.
- Message text = caption if present.

In `TelegramChannel.send()`:
- If `OutgoingMessage` has artifacts of type `"image"` → `bot.api.sendPhoto()`.
- If type `"file"` → `bot.api.sendDocument()`.

### Fix 6 — Conversation Isolation per userId

Modify `Agent` to use `Map<string, Message[]>`:
- Key = `userId`, value = conversation history.
- `handleMessage(msg)` → lookup/create conversation for user.
- Context guard applies per conversation.
- Memory ingestion remains global (shared across users).

### Fix 7 — Unauthorized Access Audit

When `isUserAllowed()` returns false:
- Log the attempt with userId, timestamp, truncated text.
- Optional config: `telegram.rejectMessage` to send a rejection message.

---

## 4. Type Changes (`@augure/types`)

```typescript
// channels.ts — additions
export interface IncomingMessage {
  // existing fields...
  attachments?: Attachment[];
}

export interface Attachment {
  type: "photo" | "document";
  fileId: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
}

// config.ts — additions to telegram config
telegram?: {
  enabled: boolean;
  botToken: string;
  allowedUsers: number[];
  rejectMessage?: string;  // optional message for unauthorized users
};
```

## 5. Documentation (Fumadocs)

### New files

```
apps/docs/content/docs/channels/
  index.mdx      — Channels overview (architecture, middleware pipeline, supported channels)
  telegram.mdx   — Telegram guide (setup, config, features, commands, troubleshooting)
```

### `channels/index.mdx`

- Channel interface explanation
- Middleware pipeline diagram
- Supported channels table (Telegram = ready, WhatsApp/Web = planned)

### `channels/telegram.mdx`

1. Prerequisites (BotFather, token, userId)
2. Configuration (`channels.telegram` in augure.json5)
3. How it works (long-polling, allowlist, message flow)
4. Features (text, photos, documents, reply threading, markdown)
5. Commands (`/pause`, `/resume`, `/kill`, `/status`)
6. Message limits (auto-splitting)
7. Security (allowlist, audit)
8. Troubleshooting (common errors)

### Updates to existing docs

- `index.mdx` (Getting Started) — add Channels link to "What's Next"
- `configuration.mdx` — update `channels.telegram` section with new fields

## 6. Test Coverage

- `split-message.test.ts` — edge cases: empty, exactly 4096, code blocks split, unicode
- `escape-markdown.test.ts` — special chars, code blocks preserved, mixed content
- `error-handler.test.ts` — retry logic, max retries, different error types
- `telegram.test.ts` — extend with media handler mocks, unauthorized audit logging
- `pipeline.test.ts` — middleware composition order
