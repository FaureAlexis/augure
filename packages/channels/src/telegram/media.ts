import type { Bot } from "grammy";
import type { IncomingMessage, Attachment } from "@augure/types";

export function registerMediaHandlers(
  bot: Bot,
  isAllowed: (userId: number) => boolean,
  handlers: ((message: IncomingMessage) => Promise<void>)[],
  onRejected?: (userId: number, timestamp: Date) => void,
): void {
  // Photo handler
  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from.id;
    if (!isAllowed(userId)) {
      onRejected?.(userId, new Date(ctx.message.date * 1000));
      return;
    }

    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1]!;

    const attachment: Attachment = {
      type: "photo",
      fileId: largest.file_id,
      caption: ctx.message.caption ?? undefined,
    };

    const incoming: IncomingMessage = {
      id: String(ctx.message.message_id),
      channelType: "telegram",
      userId: String(userId),
      text: ctx.message.caption ?? "[Photo]",
      timestamp: new Date(ctx.message.date * 1000),
      replyTo: ctx.message.reply_to_message
        ? String(ctx.message.reply_to_message.message_id)
        : undefined,
      attachments: [attachment],
    };

    for (const handler of handlers) {
      await handler(incoming);
    }
  });

  // Document handler
  bot.on("message:document", async (ctx) => {
    const userId = ctx.from.id;
    if (!isAllowed(userId)) {
      onRejected?.(userId, new Date(ctx.message.date * 1000));
      return;
    }

    const doc = ctx.message.document;
    const attachment: Attachment = {
      type: "document",
      fileId: doc.file_id,
      fileName: doc.file_name ?? undefined,
      mimeType: doc.mime_type ?? undefined,
      caption: ctx.message.caption ?? undefined,
    };

    const incoming: IncomingMessage = {
      id: String(ctx.message.message_id),
      channelType: "telegram",
      userId: String(userId),
      text: ctx.message.caption ?? `[Document: ${doc.file_name ?? "unknown"}]`,
      timestamp: new Date(ctx.message.date * 1000),
      replyTo: ctx.message.reply_to_message
        ? String(ctx.message.reply_to_message.message_id)
        : undefined,
      attachments: [attachment],
    };

    for (const handler of handlers) {
      await handler(incoming);
    }
  });
}
