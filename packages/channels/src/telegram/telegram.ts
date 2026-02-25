import { Bot, InlineKeyboard } from "grammy";
import type { Channel, IncomingMessage, OutgoingMessage, Logger, ApprovalResponse, InlineButton } from "@augure/types";
import { noopLogger } from "@augure/types";
import { createOutgoingPipeline } from "../pipeline.js";
import { createSplitMessageMiddleware } from "../middleware/split-message.js";
import { withRetry } from "../middleware/error-handler.js";
import { markdownToTelegramHtml } from "../middleware/markdown-to-html.js";
import { registerMediaHandlers } from "./media.js";

export interface TelegramConfig {
  botToken: string;
  allowedUsers: number[];
  rejectMessage?: string;
  logger?: Logger;
}

export class TelegramChannel implements Channel {
  readonly type = "telegram" as const;
  private bot: Bot;
  private allowedUsers: Set<number>;
  private handlers: ((message: IncomingMessage) => Promise<void>)[] = [];
  private approvalHandlers: ((response: ApprovalResponse) => void)[] = [];
  private sendPipeline: ((message: OutgoingMessage) => Promise<void>) | undefined;
  private readonly log: Logger;

  constructor(config: TelegramConfig) {
    this.log = config.logger ?? noopLogger;
    this.bot = new Bot(config.botToken);
    this.allowedUsers = new Set(config.allowedUsers);

    // Error handler
    this.bot.catch((err) => {
      this.log.error("Bot error:", err.message ?? err);
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

    // Approval callback handler
    this.bot.on("callback_query:data", async (ctx) => {
      if (!this.isUserAllowed(ctx.from.id)) {
        await ctx.answerCallbackQuery({ text: "Not authorized" });
        return;
      }

      const data = ctx.callbackQuery.data;
      const match = /^(approve|reject):(.+)$/.exec(data);
      if (!match) return;

      const [, action, requestId] = match;
      const approved = action === "approve";
      const userId = String(ctx.from.id);

      await ctx.answerCallbackQuery({ text: approved ? "Approved" : "Rejected" });

      // Edit the original message to show result
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        const originalText = (ctx.callbackQuery.message && "text" in ctx.callbackQuery.message)
          ? ctx.callbackQuery.message.text ?? ""
          : "";
        await ctx.editMessageText(`${originalText}\n\n${approved ? "Approved" : "Rejected"}`);
      } catch {
        // Best effort — message might be too old to edit
      }

      for (const handler of this.approvalHandlers) {
        handler({ requestId: requestId!, approved, userId });
      }
    });

    // Build outgoing pipeline: split raw markdown first, then convert + send
    const convertAndSend = async (msg: OutgoingMessage): Promise<void> => {
      const htmlText = markdownToTelegramHtml(msg.text);
      const replyOpts = msg.replyTo
        ? { reply_parameters: { message_id: Number(msg.replyTo) } }
        : {};

      await withRetry(
        () =>
          this.bot.api.sendMessage(Number(msg.userId), htmlText, {
            parse_mode: "HTML",
            ...replyOpts,
          }),
        { maxRetries: 3, baseDelayMs: 500 },
      ).catch(async () => {
        // Fallback: send as plain text (no formatting)
        await this.bot.api.sendMessage(Number(msg.userId), msg.text, replyOpts)
          .catch((fallbackErr) => {
            this.log.error("Fallback send also failed:", fallbackErr);
            throw fallbackErr;
          });
      });
    };

    this.sendPipeline = createOutgoingPipeline(
      [createSplitMessageMiddleware(convertAndSend)],
      convertAndSend,
    );
  }

  isUserAllowed(userId: number): boolean {
    return this.allowedUsers.has(userId);
  }

  private handleRejected(userId: number, unixTimestamp: number, rejectMessage?: string): void {
    this.log.warn(
      `Rejected message from unauthorized user ${userId} at ${new Date(unixTimestamp * 1000).toISOString()}`,
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

  async sendApprovalRequest(userId: string, text: string, buttons: InlineButton[], _requestId: string): Promise<void> {
    const keyboard = new InlineKeyboard();
    for (const btn of buttons) {
      keyboard.text(btn.label, btn.callbackData);
    }
    await this.bot.api.sendMessage(Number(userId), text, {
      reply_markup: keyboard,
    });
  }

  onApprovalResponse(handler: (response: ApprovalResponse) => void): void {
    this.approvalHandlers.push(handler);
  }
}
