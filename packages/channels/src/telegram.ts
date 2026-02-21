import { Bot } from "grammy";
import type { Channel, IncomingMessage, OutgoingMessage } from "@augure/types";

export interface TelegramConfig {
  botToken: string;
  allowedUsers: number[];
}

export class TelegramChannel implements Channel {
  readonly type = "telegram" as const;
  private bot: Bot;
  private allowedUsers: Set<number>;
  private handlers: ((message: IncomingMessage) => Promise<void>)[] = [];

  constructor(config: TelegramConfig) {
    this.bot = new Bot(config.botToken);
    this.allowedUsers = new Set(config.allowedUsers);

    this.bot.on("message:text", async (ctx) => {
      const userId = ctx.from.id;

      if (!this.isUserAllowed(userId)) {
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
  }

  isUserAllowed(userId: number): boolean {
    return this.allowedUsers.has(userId);
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
    await this.bot.api.sendMessage(Number(message.userId), message.text, {
      parse_mode: "Markdown",
      ...(message.replyTo
        ? { reply_parameters: { message_id: Number(message.replyTo) } }
        : {}),
    });
  }
}
