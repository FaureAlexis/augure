import { Bot } from "grammy";
import type { Channel, IncomingMessage, OutgoingMessage } from "@augure/types";
import { createOutgoingPipeline } from "../pipeline.js";
import { createEscapeMarkdownMiddleware } from "../middleware/escape-markdown.js";
import { createSplitMessageMiddleware } from "../middleware/split-message.js";
import { withRetry } from "../middleware/error-handler.js";
import { registerMediaHandlers } from "./media.js";

export interface TelegramConfig {
  botToken: string;
  allowedUsers: number[];
  rejectMessage?: string;
}

export class TelegramChannel implements Channel {
  readonly type = "telegram" as const;
  private bot: Bot;
  private allowedUsers: Set<number>;
  private handlers: ((message: IncomingMessage) => Promise<void>)[] = [];
  private sendPipeline: ((message: OutgoingMessage) => Promise<void>) | undefined;

  constructor(config: TelegramConfig) {
    this.bot = new Bot(config.botToken);
    this.allowedUsers = new Set(config.allowedUsers);

    // Error handler
    this.bot.catch((err) => {
      console.error("[augure:telegram] Bot error:", err.message ?? err);
    });

    // Text message handler
    this.bot.on("message:text", async (ctx) => {
      const userId = ctx.from.id;

      if (!this.isUserAllowed(userId)) {
        this.handleRejected(userId, ctx.message.date, config.rejectMessage);
        return;
      }

      const incoming: IncomingMessage = {
        id: String(ctx.message.message_id),
        channelType: "telegram",
        userId: String(userId),
        text: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000),
        replyTo: ctx.message.reply_to_message
          ? String(ctx.message.reply_to_message.message_id)
          : undefined,
      };

      for (const handler of this.handlers) {
        await handler(incoming);
      }
    });

    // Media handlers
    registerMediaHandlers(
      this.bot,
      (id) => this.isUserAllowed(id),
      this.handlers,
      (userId, ts) => this.handleRejected(userId, Math.floor(ts.getTime() / 1000), config.rejectMessage),
    );

    // Build outgoing middleware pipeline
    const rawSend = async (msg: OutgoingMessage): Promise<void> => {
      await withRetry(
        () =>
          this.bot.api.sendMessage(Number(msg.userId), msg.text, {
            parse_mode: "MarkdownV2",
            ...(msg.replyTo
              ? { reply_parameters: { message_id: Number(msg.replyTo) } }
              : {}),
          }),
        { maxRetries: 3, baseDelayMs: 500 },
      ).catch(async () => {
        // Fallback: send without parse_mode if MarkdownV2 fails
        await this.bot.api.sendMessage(Number(msg.userId), msg.text, {
          ...(msg.replyTo
            ? { reply_parameters: { message_id: Number(msg.replyTo) } }
            : {}),
        }).catch((fallbackErr) => {
          console.error("[augure:telegram] Fallback send also failed:", fallbackErr);
          throw fallbackErr;
        });
      });
    };

    this.sendPipeline = createOutgoingPipeline(
      [
        createEscapeMarkdownMiddleware(),
        createSplitMessageMiddleware(rawSend),
      ],
      rawSend,
    );
  }

  isUserAllowed(userId: number): boolean {
    return this.allowedUsers.has(userId);
  }

  private handleRejected(userId: number, unixTimestamp: number, rejectMessage?: string): void {
    console.warn(
      `[augure:telegram] Rejected message from unauthorized user ${userId} at ${new Date(unixTimestamp * 1000).toISOString()}`,
    );
    if (rejectMessage) {
      this.bot.api
        .sendMessage(userId, rejectMessage)
        .catch(() => {}); // best effort
    }
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async send(message: OutgoingMessage): Promise<void> {
    await this.sendPipeline!(message);
  }
}
