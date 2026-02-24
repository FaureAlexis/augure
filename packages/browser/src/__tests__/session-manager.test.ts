import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserSessionManager } from "../session-manager.js";
import type { BrowserConfig, LLMModelConfig } from "@augure/types";

// Mock Stagehand page
const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  url: vi.fn().mockReturnValue("https://example.com"),
  title: vi.fn().mockResolvedValue("Example"),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
};

// Mock Stagehand instance (V3 API)
const mockStagehand = {
  init: vi.fn().mockResolvedValue(undefined),
  act: vi.fn().mockResolvedValue({ success: true, message: "Done", actionDescription: "Clicked", actions: [] }),
  extract: vi.fn().mockResolvedValue({ title: "Test" }),
  observe: vi.fn().mockResolvedValue([{ description: "Button", selector: "//button" }]),
  context: { activePage: () => mockPage, pages: () => [mockPage] },
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@browserbasehq/stagehand", () => ({
  Stagehand: vi.fn().mockImplementation(function () {
    return mockStagehand;
  }),
}));

const browserConfig: BrowserConfig = { provider: "local" };
const llmConfig: LLMModelConfig = {
  provider: "openrouter",
  apiKey: "sk-test",
  model: "test/model",
  maxTokens: 4096,
};

describe("BrowserSessionManager", () => {
  let manager: BrowserSessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new BrowserSessionManager({
      config: browserConfig,
      llm: llmConfig,
      ttlMs: 5000,
    });
  });

  afterEach(async () => {
    await manager.closeAll();
  });

  it("should open a session and return a sessionId", async () => {
    const sessionId = await manager.open();
    expect(sessionId).toMatch(/^s_/);
    expect(mockStagehand.init).toHaveBeenCalled();
  });

  it("should open with URL and navigate", async () => {
    const sessionId = await manager.open("https://example.com");
    expect(sessionId).toMatch(/^s_/);
    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", { waitUntil: "domcontentloaded" });
  });

  it("should execute act on session", async () => {
    const sessionId = await manager.open();
    const result = await manager.act(sessionId, "click the button");
    expect(mockStagehand.act).toHaveBeenCalledWith("click the button", undefined);
    expect(result.success).toBe(true);
  });

  it("should pass variables to act", async () => {
    const sessionId = await manager.open();
    await manager.act(sessionId, "type %password%", { password: "secret" });
    expect(mockStagehand.act).toHaveBeenCalledWith("type %password%", {
      variables: { password: "secret" },
    });
  });

  it("should execute extract on session", async () => {
    const sessionId = await manager.open();
    const result = await manager.extract(sessionId, "get the title");
    expect(mockStagehand.extract).toHaveBeenCalledWith("get the title");
    expect(result).toEqual({ title: "Test" });
  });

  it("should pass schema to extract", async () => {
    const sessionId = await manager.open();
    const schema = { type: "object", properties: { title: { type: "string" } } };
    await manager.extract(sessionId, "get data", schema);
    expect(mockStagehand.extract).toHaveBeenCalledWith("get data", schema);
  });

  it("should execute observe on session", async () => {
    const sessionId = await manager.open();
    const result = await manager.observe(sessionId, "find buttons");
    expect(mockStagehand.observe).toHaveBeenCalledWith("find buttons");
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Button");
  });

  it("should take a screenshot", async () => {
    const sessionId = await manager.open();
    const base64 = await manager.screenshot(sessionId);
    expect(mockPage.screenshot).toHaveBeenCalled();
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
  });

  it("should navigate to URL", async () => {
    const sessionId = await manager.open();
    await manager.navigate(sessionId, "https://google.com");
    expect(mockPage.goto).toHaveBeenCalledWith("https://google.com", { waitUntil: "domcontentloaded" });
  });

  it("should throw on unknown session", async () => {
    await expect(manager.act("invalid", "click")).rejects.toThrow("no browser session");
  });

  it("should close session", async () => {
    const sessionId = await manager.open();
    await manager.close(sessionId);
    expect(mockStagehand.close).toHaveBeenCalled();
    await expect(manager.act(sessionId, "click")).rejects.toThrow("no browser session");
  });

  it("should be idempotent on close for unknown session", async () => {
    // Should not throw
    await manager.close("nonexistent");
  });

  it("should close all sessions on closeAll", async () => {
    await manager.open();
    await manager.open();
    await manager.closeAll();
    expect(mockStagehand.close).toHaveBeenCalledTimes(2);
  });
});
