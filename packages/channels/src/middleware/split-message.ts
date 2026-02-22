import type { OutgoingMessage } from "@augure/types";
import type { OutgoingMiddleware } from "../types.js";

const TELEGRAM_MAX = 4096;

export function splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  let openCodeBlock: string | null = null;

  while (remaining.length > 0) {
    // Prepend code block reopening if we're continuing one
    const prefix = openCodeBlock ? `${openCodeBlock}\n` : "";
    const effectiveMax = maxLength - prefix.length;

    if (remaining.length <= effectiveMax) {
      chunks.push(prefix + remaining);
      break;
    }

    let splitAt = -1;
    const searchArea = remaining.slice(0, effectiveMax);

    // Try paragraph break
    const paraIdx = searchArea.lastIndexOf("\n\n");
    if (paraIdx > effectiveMax * 0.3) {
      splitAt = paraIdx;
    }

    // Try newline break
    if (splitAt === -1) {
      const newlineIdx = searchArea.lastIndexOf("\n");
      if (newlineIdx > effectiveMax * 0.3) {
        splitAt = newlineIdx;
      }
    }

    // Hard split
    if (splitAt === -1) {
      splitAt = effectiveMax;
    }

    let chunk = remaining.slice(0, splitAt);
    remaining = remaining.slice(splitAt).replace(/^\n+/, "");

    // Track code blocks: count opening fences (```lang) and closing fences (```)
    const fenceMatches = chunk.match(/```/g);
    const fenceCount = fenceMatches ? fenceMatches.length : 0;

    if (openCodeBlock) {
      // We were inside a code block
      chunk = prefix + chunk;
      if (fenceCount % 2 === 1) {
        // Odd fences: code block was closed
        openCodeBlock = null;
      } else {
        // Even fences (or zero): still inside code block, close it
        chunk += "\n```";
      }
    } else {
      // Not inside a code block
      if (fenceCount % 2 === 1) {
        // Odd fences: we opened a code block that wasn't closed
        // Find the language tag of the last opening fence
        const lastFenceIdx = chunk.lastIndexOf("```");
        const afterFence = chunk.slice(lastFenceIdx + 3);
        const langMatch = afterFence.match(/^(\w*)/);
        openCodeBlock = "```" + (langMatch?.[1] ?? "");
        chunk += "\n```";
      }
    }

    chunks.push(chunk);
  }

  return chunks.length === 0 ? [""] : chunks;
}

export function createSplitMessageMiddleware(
  sendFn: (message: OutgoingMessage) => Promise<void>,
  maxLength = TELEGRAM_MAX,
): OutgoingMiddleware {
  return async (message, next) => {
    const chunks = splitText(message.text, maxLength);

    if (chunks.length <= 1) {
      await next();
      return;
    }

    for (let i = 0; i < chunks.length; i++) {
      await sendFn({
        ...message,
        text: chunks[i]!,
        replyTo: i === 0 ? message.replyTo : undefined,
      });
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  };
}
