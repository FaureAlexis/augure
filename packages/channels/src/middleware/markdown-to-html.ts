/**
 * Converts standard Markdown (LLM output) to Telegram-compatible HTML.
 *
 * Telegram supports `parse_mode: "HTML"` which is far easier to target than
 * MarkdownV2 because only `<`, `>`, and `&` need escaping in plain text.
 *
 * Conversion pipeline:
 *   1. Extract code blocks / inline code / links into placeholders
 *   2. HTML-escape the remaining text
 *   3. Convert formatting markers (bold, italic, strikethrough, headers, blockquotes)
 *   4. Restore placeholders
 */

export function markdownToTelegramHtml(text: string): string {
  if (!text) return "";

  const placeholders: string[] = [];
  const PH_PREFIX = "\u{FFFC}PH";
  const PH_SUFFIX = "\u{FFFC}";
  function hold(html: string): string {
    const idx = placeholders.length;
    placeholders.push(html);
    return `${PH_PREFIX}${idx}${PH_SUFFIX}`;
  }

  let out = text;

  // 1a. Fenced code blocks → placeholder (must run before inline code)
  out = out.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang: string, code: string) =>
    hold(
      lang
        ? `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trimEnd())}</code></pre>`
        : `<pre>${escapeHtml(code.trimEnd())}</pre>`,
    ),
  );

  // 1b. Inline code → placeholder
  out = out.replace(/`([^`\n]+)`/g, (_, code: string) =>
    hold(`<code>${escapeHtml(code)}</code>`),
  );

  // 1c. Links → placeholder (protect URLs from HTML-escaping)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText: string, url: string) =>
    hold(`<a href="${escapeHtml(url)}">${escapeHtml(linkText)}</a>`),
  );

  // 2. HTML-escape remaining text (only <, >, & matter)
  out = escapeHtml(out);

  // 3. Convert markdown formatting → HTML (order matters: longest markers first)

  // Bold-italic: ***text***
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>");

  // Bold: **text**
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Italic: *text* (single asterisk only, after ** is consumed)
  out = out.replace(/\*([^*\n]+?)\*/g, "<i>$1</i>");

  // Strikethrough: ~~text~~
  out = out.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Headers: # … → bold (Telegram has no header entity)
  out = out.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Blockquotes: > text  (escaped to &gt; by step 2)
  out = out.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  out = out.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // 4. Restore placeholders
  const phPattern = new RegExp(`${PH_PREFIX}(\\d+)${PH_SUFFIX}`, "g");
  out = out.replace(phPattern, (_, idx) => placeholders[Number(idx)]!);

  return out;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
