import { describe, it, expect } from "vitest";
import { markdownToTelegramHtml, escapeHtml } from "../middleware/markdown-to-html.js";

describe("markdownToTelegramHtml", () => {
  it("should convert **bold** to <b>", () => {
    expect(markdownToTelegramHtml("Hello **world**")).toBe("Hello <b>world</b>");
  });

  it("should convert *italic* to <i>", () => {
    expect(markdownToTelegramHtml("Hello *world*")).toBe("Hello <i>world</i>");
  });

  it("should convert ***bold italic*** to <b><i>", () => {
    expect(markdownToTelegramHtml("***wow***")).toBe("<b><i>wow</i></b>");
  });

  it("should convert ~~strikethrough~~ to <s>", () => {
    expect(markdownToTelegramHtml("~~deleted~~")).toBe("<s>deleted</s>");
  });

  it("should convert inline code", () => {
    expect(markdownToTelegramHtml("Use `array.map()` here")).toBe(
      "Use <code>array.map()</code> here",
    );
  });

  it("should convert fenced code blocks with language", () => {
    const input = "Text:\n```python\nprint('hello')\n```\nEnd.";
    expect(markdownToTelegramHtml(input)).toBe(
      "Text:\n<pre><code class=\"language-python\">print('hello')</code></pre>\nEnd.",
    );
  });

  it("should convert fenced code blocks without language", () => {
    expect(markdownToTelegramHtml("```\nfoo()\n```")).toBe("<pre>foo()</pre>");
  });

  it("should convert links to <a> tags", () => {
    expect(markdownToTelegramHtml("[Google](https://google.com)")).toBe(
      '<a href="https://google.com">Google</a>',
    );
  });

  it("should convert headers to bold", () => {
    expect(markdownToTelegramHtml("## Hello")).toBe("<b>Hello</b>");
    expect(markdownToTelegramHtml("# Title")).toBe("<b>Title</b>");
    expect(markdownToTelegramHtml("### Sub")).toBe("<b>Sub</b>");
  });

  it("should escape < > & in plain text", () => {
    expect(markdownToTelegramHtml("a < b & c > d")).toBe(
      "a &lt; b &amp; c &gt; d",
    );
  });

  it("should escape HTML inside code blocks", () => {
    expect(markdownToTelegramHtml("```\na < b && c > d\n```")).toBe(
      "<pre>a &lt; b &amp;&amp; c &gt; d</pre>",
    );
  });

  it("should escape HTML inside inline code", () => {
    expect(markdownToTelegramHtml("`a < b`")).toBe("<code>a &lt; b</code>");
  });

  it("should handle empty string", () => {
    expect(markdownToTelegramHtml("")).toBe("");
  });

  it("should convert blockquotes", () => {
    expect(markdownToTelegramHtml("> quoted text")).toBe(
      "<blockquote>quoted text</blockquote>",
    );
  });

  it("should merge consecutive blockquote lines", () => {
    expect(markdownToTelegramHtml("> line1\n> line2")).toBe(
      "<blockquote>line1\nline2</blockquote>",
    );
  });

  it("should escape & in link URLs", () => {
    expect(
      markdownToTelegramHtml("[test](https://example.com?a=1&b=2)"),
    ).toBe('<a href="https://example.com?a=1&amp;b=2">test</a>');
  });

  it("should handle mixed formatting in a realistic LLM response", () => {
    const input = [
      "## Summary",
      "",
      "Here is **important** info with *emphasis*.",
      "",
      "Check [the docs](https://example.com) for details.",
      "",
      "```typescript",
      "const x = a < b ? 1 : 2;",
      "```",
      "",
      "That's it!",
    ].join("\n");

    const result = markdownToTelegramHtml(input);

    expect(result).toContain("<b>Summary</b>");
    expect(result).toContain("<b>important</b>");
    expect(result).toContain("<i>emphasis</i>");
    expect(result).toContain('<a href="https://example.com">the docs</a>');
    expect(result).toContain('<pre><code class="language-typescript">');
    expect(result).toContain("a &lt; b");
    expect(result).not.toContain("**");
    expect(result).not.toContain("##");
  });

  it("should not break formatting markers inside code", () => {
    expect(markdownToTelegramHtml("Run `**not bold**` now")).toBe(
      "Run <code>**not bold**</code> now",
    );
  });

  it("should handle bold wrapping a link", () => {
    const result = markdownToTelegramHtml("See **[link](https://x.com)** here");
    expect(result).toContain("<b>");
    expect(result).toContain('<a href="https://x.com">link</a>');
  });
});

describe("escapeHtml", () => {
  it("should escape & < >", () => {
    expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("should not double-escape", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
});
