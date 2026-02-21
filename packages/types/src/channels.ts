export interface IncomingMessage {
  id: string;
  channelType: "telegram" | "whatsapp" | "web" | "system";
  userId: string;
  text: string;
  timestamp: Date;
  replyTo?: string;
}

export interface OutgoingMessage {
  channelType: "telegram" | "whatsapp" | "web" | "system";
  userId: string;
  text: string;
  replyTo?: string;
}

export interface Channel {
  type: "telegram" | "whatsapp" | "web" | "system";
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutgoingMessage): Promise<void>;
  onMessage(handler: (message: IncomingMessage) => Promise<void>): void;
}
