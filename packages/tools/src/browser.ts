import type { NativeTool, ToolContext, ToolResult } from "@augure/types";
import type { BrowserSessionManager } from "@augure/browser";

type Action = "open" | "navigate" | "act" | "extract" | "observe" | "screenshot" | "close";

interface BrowserParams {
  action: Action;
  session?: string;
  url?: string;
  instruction?: string;
  schema?: Record<string, unknown>;
  variables?: Record<string, string>;
}

export function createBrowserTool(manager: BrowserSessionManager): NativeTool {
  return {
    name: "browser",
    description:
      "AI-powered browser automation. Open a session, then use natural language to interact with web pages. " +
      "Actions: open (creates session), navigate, act (click/type/interact), extract (get structured data), " +
      "observe (discover elements), screenshot, close. " +
      "Use 'act' with natural language instructions instead of CSS selectors. " +
      "Use 'extract' with an instruction describing what data to get. " +
      "Always close sessions when done.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open", "navigate", "act", "extract", "observe", "screenshot", "close"],
          description: "The browser action to perform",
        },
        session: {
          type: "string",
          description: "Session ID from 'open'. Required for all actions except 'open'.",
        },
        url: {
          type: "string",
          description: "URL to navigate to. Used with 'open' and 'navigate'.",
        },
        instruction: {
          type: "string",
          description:
            "Natural language instruction for act/extract/observe. " +
            "Examples: 'click the search button', 'extract all product prices and titles', 'find the login form'.",
        },
        schema: {
          type: "object",
          description: "JSON schema for structured extraction with 'extract'. Optional.",
        },
        variables: {
          type: "object",
          description:
            "Variables for sensitive data in 'act'. Use %varName% in instruction. " +
            "Example: instruction='type %password%', variables={password: 'secret'}",
        },
      },
      required: ["action"],
    },

    configCheck: (ctx: ToolContext) => {
      if (!ctx.config.tools?.browser) {
        return "Browser tool requires tools.browser config in augure.json5. Set provider to 'local' for Playwright or 'browserbase' for cloud.";
      }
      if (
        ctx.config.tools.browser.provider === "browserbase" &&
        !ctx.config.tools.browser.browserbase?.apiKey
      ) {
        return "Browserbase provider requires tools.browser.browserbase.apiKey";
      }
      return null;
    },

    execute: async (params: unknown, _ctx: ToolContext): Promise<ToolResult> => {
      const p = params as BrowserParams;

      if (p.action !== "open" && !p.session) {
        return { success: false, output: "Missing 'session' — open a session first with action: 'open'" };
      }

      if (["act", "extract", "observe"].includes(p.action) && !p.instruction) {
        return { success: false, output: `Missing 'instruction' for action '${p.action}'` };
      }

      try {
        switch (p.action) {
          case "open": {
            const sessionId = await manager.open(p.url);
            return { success: true, output: `Session ${sessionId} opened.${p.url ? ` Navigated to ${p.url}` : ""}` };
          }

          case "navigate": {
            if (!p.url) return { success: false, output: "Missing 'url' for navigate" };
            await manager.navigate(p.session!, p.url);
            return { success: true, output: `Navigated to ${p.url}` };
          }

          case "act": {
            const result = await manager.act(p.session!, p.instruction!, p.variables);
            return { success: result.success, output: result.message || "Action completed" };
          }

          case "extract": {
            const data = await manager.extract(p.session!, p.instruction!, p.schema);
            const output = typeof data === "string" ? data : JSON.stringify(data, null, 2);
            return { success: true, output };
          }

          case "observe": {
            const elements = await manager.observe(p.session!, p.instruction!);
            return {
              success: true,
              output: elements.length > 0
                ? elements.map((e) => `- ${e.description} (${e.selector})`).join("\n")
                : "No matching elements found",
            };
          }

          case "screenshot": {
            const base64 = await manager.screenshot(p.session!);
            return {
              success: true,
              output: "Screenshot captured",
              artifacts: [{ type: "image", name: "screenshot.png", content: base64 }],
            };
          }

          case "close": {
            await manager.close(p.session!);
            return { success: true, output: `Session ${p.session} closed` };
          }

          default:
            return { success: false, output: `Unknown action: ${p.action}` };
        }
      } catch (err) {
        return {
          success: false,
          output: `Browser error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
