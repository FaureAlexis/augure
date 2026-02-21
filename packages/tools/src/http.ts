import type { NativeTool } from "@augure/types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576; // 1 MB
const MAX_OUTPUT_CHARS = 4000;

export const httpTool: NativeTool = {
  name: "http",
  description:
    "Make HTTP requests (GET or POST). Use a preset name to inject auth headers from config.",
  parameters: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST"], description: "HTTP method" },
      url: { type: "string", description: "Full URL, or path if using a preset" },
      preset: { type: "string", description: "Config preset name for auth injection" },
      body: { type: "object", description: "JSON body (POST only)" },
      headers: { type: "object", description: "Additional headers (no auth — use preset)" },
    },
    required: ["method", "url"],
  },
  execute: async (params, ctx) => {
    const { method, url, preset, body, headers: extraHeaders } = params as {
      method: string;
      url: string;
      preset?: string;
      body?: Record<string, unknown>;
      headers?: Record<string, string>;
    };

    if (method !== "GET" && method !== "POST") {
      return { success: false, output: "Only GET or POST methods are allowed" };
    }

    const httpConfig = ctx.config.tools?.http;

    let resolvedUrl = url;
    let presetHeaders: Record<string, string> = {};

    if (preset) {
      const presetConfig = httpConfig?.presets?.[preset];
      if (!presetConfig) {
        return {
          success: false,
          output: `Unknown preset: "${preset}". Check your config.`,
        };
      }
      if (!url.startsWith("http")) {
        resolvedUrl = presetConfig.baseUrl + url;
      }
      presetHeaders = presetConfig.headers ?? {};
    }

    const mergedHeaders: Record<string, string> = {
      ...(httpConfig?.defaultHeaders ?? {}),
      ...(extraHeaders ?? {}),
      ...presetHeaders,
    };

    if (body) {
      mergedHeaders["Content-Type"] = "application/json";
    }

    const timeoutMs = httpConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = httpConfig?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(resolvedUrl, {
        method,
        headers: mergedHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const raw = await res.arrayBuffer();
      let text = new TextDecoder().decode(raw.slice(0, maxBytes));
      if (raw.byteLength > maxBytes) {
        text += "\n[response truncated at byte limit]";
      }
      if (text.length > MAX_OUTPUT_CHARS) {
        text = text.slice(0, MAX_OUTPUT_CHARS) + "\n[truncated]";
      }

      const contentType = res.headers.get("content-type") ?? "";
      const output = `Status: ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\n${text}`;

      return { success: res.ok, output };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
