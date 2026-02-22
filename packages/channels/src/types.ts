import type { OutgoingMessage } from "@augure/types";

export interface OutgoingMiddleware {
  (message: OutgoingMessage, next: () => Promise<void>): Promise<void>;
}
