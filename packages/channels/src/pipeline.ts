import type { OutgoingMessage } from "@augure/types";
import type { OutgoingMiddleware } from "./types.js";

export function createOutgoingPipeline(
  middlewares: OutgoingMiddleware[],
  send: (message: OutgoingMessage) => Promise<void>,
): (message: OutgoingMessage) => Promise<void> {
  return async (message: OutgoingMessage) => {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++]!;
        await mw(message, next);
      } else {
        await send(message);
      }
    };

    await next();
  };
}
