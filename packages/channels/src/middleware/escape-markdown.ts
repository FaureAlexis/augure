import type { OutgoingMiddleware } from "../types.js";

// Characters that must be escaped in MarkdownV2 (outside code and formatting markers)
const SPECIAL_CHARS = new Set([".", "!", ">", "#", "+", "-", "=", "|", "{", "}", "~"]);

export function escapeMarkdownV2(text: string): string {
  if (!text) return "";

  const parts: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Fenced code block — pass through unchanged
    if (text.startsWith("```", i)) {
      const endIdx = text.indexOf("```", i + 3);
      if (endIdx !== -1) {
        parts.push(text.slice(i, endIdx + 3));
        i = endIdx + 3;
        continue;
      }
    }

    // Inline code — pass through unchanged
    if (text[i] === "`") {
      const endIdx = text.indexOf("`", i + 1);
      if (endIdx !== -1) {
        parts.push(text.slice(i, endIdx + 1));
        i = endIdx + 1;
        continue;
      }
    }

    // Bold/italic markers — pass through
    if (text[i] === "*" || text[i] === "_") {
      parts.push(text[i]!);
      i++;
      continue;
    }

    // Link bracket/paren — pass through [ and (
    if (text[i] === "[" || text[i] === "(") {
      parts.push(text[i]!);
      i++;
      continue;
    }
    if (text[i] === "]") {
      parts.push(text[i]!);
      i++;
      continue;
    }

    // Regular character — escape if special
    const char = text[i]!;
    if (SPECIAL_CHARS.has(char)) {
      parts.push(`\\${char}`);
    } else {
      parts.push(char);
    }
    i++;
  }

  return parts.join("");
}

export function createEscapeMarkdownMiddleware(): OutgoingMiddleware {
  return async (message, next) => {
    message.text = escapeMarkdownV2(message.text);
    await next();
  };
}
