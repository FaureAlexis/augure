import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBrowserTool } from "../browser.js";
import type { ToolContext, AppConfig } from "@augure/types";

const mockManager = {
  open: vi.fn().mockResolvedValue("s_test_1"),
  navigate: vi.fn().mockResolvedValue(undefined),
  act: vi.fn().mockResolvedValue({ success: true, message: "Clicked button" }),
  extract: vi.fn().mockResolvedValue([{ title: "Apt 1", price: 900 }]),
  observe: vi.fn().mockResolvedValue([{ description: "Search button", selector: "//button" }]),
  screenshot: vi.fn().mockResolvedValue("iVBORw0KGgo="),
  close: vi.fn().mockResolvedValue(undefined),
  closeAll: vi.fn().mockResolvedValue(undefined),
};

const ctx = {
  config: { tools: { browser: { provider: "local" } } } as unknown as AppConfig,
} as unknown as ToolContext;

describe("browser tool", () => {
  let tool: ReturnType<typeof createBrowserTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createBrowserTool(mockManager as never);
  });

  it("should have name 'browser'", () => {
    expect(tool.name).toBe("browser");
  });

  it("should open a session", async () => {
    const result = await tool.execute({ action: "open", url: "https://example.com" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("s_test_1");
    expect(mockManager.open).toHaveBeenCalledWith("https://example.com");
  });

  it("should open a session without URL", async () => {
    const result = await tool.execute({ action: "open" }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("s_test_1");
    expect(mockManager.open).toHaveBeenCalledWith(undefined);
  });

  it("should navigate", async () => {
    const result = await tool.execute({
      action: "navigate",
      session: "s_test_1",
      url: "https://example.com",
    }, ctx);
    expect(result.success).toBe(true);
    expect(mockManager.navigate).toHaveBeenCalledWith("s_test_1", "https://example.com");
  });

  it("should require url for navigate", async () => {
    const result = await tool.execute({ action: "navigate", session: "s_1" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("url");
  });

  it("should act on a session", async () => {
    const result = await tool.execute({
      action: "act",
      session: "s_test_1",
      instruction: "click the button",
    }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Clicked button");
  });

  it("should pass variables to act", async () => {
    const result = await tool.execute({
      action: "act",
      session: "s_test_1",
      instruction: "type %password%",
      variables: { password: "secret" },
    }, ctx);
    expect(result.success).toBe(true);
    expect(mockManager.act).toHaveBeenCalledWith("s_test_1", "type %password%", { password: "secret" });
  });

  it("should extract from a session", async () => {
    const result = await tool.execute({
      action: "extract",
      session: "s_test_1",
      instruction: "get all listings",
    }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Apt 1");
  });

  it("should pass schema to extract", async () => {
    const schema = { type: "object", properties: { title: { type: "string" } } };
    await tool.execute({
      action: "extract",
      session: "s_test_1",
      instruction: "get data",
      schema,
    }, ctx);
    expect(mockManager.extract).toHaveBeenCalledWith("s_test_1", "get data", schema);
  });

  it("should observe elements", async () => {
    const result = await tool.execute({
      action: "observe",
      session: "s_test_1",
      instruction: "find buttons",
    }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Search button");
  });

  it("should take a screenshot", async () => {
    const result = await tool.execute({ action: "screenshot", session: "s_test_1" }, ctx);
    expect(result.success).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts![0].type).toBe("image");
  });

  it("should close a session", async () => {
    const result = await tool.execute({ action: "close", session: "s_test_1" }, ctx);
    expect(result.success).toBe(true);
    expect(mockManager.close).toHaveBeenCalledWith("s_test_1");
  });

  it("should require session for non-open actions", async () => {
    const result = await tool.execute({ action: "act", instruction: "click" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("session");
  });

  it("should require instruction for act/extract/observe", async () => {
    const result = await tool.execute({ action: "act", session: "s_1" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("instruction");
  });

  it("should handle unknown action", async () => {
    const result = await tool.execute({ action: "unknown", session: "s_1" }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("Unknown action");
  });

  it("should handle errors from manager", async () => {
    mockManager.act.mockRejectedValueOnce(new Error("Connection lost"));
    const result = await tool.execute({
      action: "act",
      session: "s_test_1",
      instruction: "click",
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain("Connection lost");
  });

  it("should return configCheck warning when browser not configured", () => {
    const noConfig = { config: { tools: {} } } as unknown as ToolContext;
    expect(tool.configCheck!(noConfig)).toContain("browser");
  });

  it("should return configCheck warning for browserbase without apiKey", () => {
    const bbConfig = {
      config: { tools: { browser: { provider: "browserbase" } } },
    } as unknown as ToolContext;
    expect(tool.configCheck!(bbConfig)).toContain("apiKey");
  });

  it("should return null from configCheck when properly configured", () => {
    expect(tool.configCheck!(ctx)).toBeNull();
  });
});
