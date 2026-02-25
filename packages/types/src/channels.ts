export interface Attachment {
  type: "photo" | "document";
  fileId: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
}

export interface IncomingMessage {
  id: string;
  channelType: "telegram" | "whatsapp" | "web" | "system";
  userId: string;
  text: string;
  timestamp: Date;
  replyTo?: string;
  attachments?: Attachment[];
}

export interface OutgoingMessage {
  channelType: "telegram" | "whatsapp" | "web" | "system";
  userId: string;
  text: string;
  replyTo?: string;
}

export interface InlineButton {
  label: string;
  callbackData: string;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  userId: string;
}

export interface Channel {
  type: "telegram" | "whatsapp" | "web" | "system";
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutgoingMessage): Promise<void>;
  onMessage(handler: (message: IncomingMessage) => Promise<void>): void;
  /** Send an approval request with action buttons. Channels that don't support this leave it undefined. */
  sendApprovalRequest?(userId: string, text: string, buttons: InlineButton[], requestId: string): Promise<void>;
  /** Register a handler for when the user responds to an approval request. */
  onApprovalResponse?(handler: (response: ApprovalResponse) => void): void;
}
