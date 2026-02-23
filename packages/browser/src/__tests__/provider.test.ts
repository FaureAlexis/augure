import { describe, it, expect } from "vitest";
import { createStagehandConfig } from "../provider.js";

describe("createStagehandConfig", () => {
  it("should create LOCAL config for local provider", () => {
    const config = createStagehandConfig(
      { provider: "local", defaults: { headless: true, timeout: 30 } },
      { provider: "openrouter", apiKey: "sk-test", model: "anthropic/claude-sonnet-4-5", maxTokens: 4096 },
    );

    expect(config.env).toBe("LOCAL");
    expect(config.localBrowserLaunchOptions?.headless).toBe(true);
    expect(config.model).toEqual({
      modelName: "anthropic/claude-sonnet-4-5",
      apiKey: "sk-test",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("should create BROWSERBASE config for browserbase provider", () => {
    const config = createStagehandConfig(
      {
        provider: "browserbase",
        browserbase: { apiKey: "bb-key", projectId: "proj-123" },
      },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.env).toBe("BROWSERBASE");
    expect(config.apiKey).toBe("bb-key");
    expect(config.projectId).toBe("proj-123");
  });

  it("should set viewport defaults when not specified", () => {
    const config = createStagehandConfig(
      { provider: "local" },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.localBrowserLaunchOptions?.viewport).toEqual({ width: 1280, height: 720 });
  });

  it("should resolve OpenRouter base URL", () => {
    const config = createStagehandConfig(
      { provider: "local" },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.model).toHaveProperty("baseURL", "https://openrouter.ai/api/v1");
  });

  it("should resolve Anthropic base URL", () => {
    const config = createStagehandConfig(
      { provider: "local" },
      { provider: "anthropic", apiKey: "sk-ant", model: "claude-3-opus", maxTokens: 4096 },
    );

    expect(config.model).toHaveProperty("baseURL", "https://api.anthropic.com/v1");
  });

  it("should resolve OpenAI base URL", () => {
    const config = createStagehandConfig(
      { provider: "local" },
      { provider: "openai", apiKey: "sk-oai", model: "gpt-4", maxTokens: 4096 },
    );

    expect(config.model).toHaveProperty("baseURL", "https://api.openai.com/v1");
  });

  it("should not set localBrowserLaunchOptions for browserbase", () => {
    const config = createStagehandConfig(
      { provider: "browserbase", browserbase: { apiKey: "bb-key" } },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.localBrowserLaunchOptions).toBeUndefined();
  });

  it("should use default timeout of 30 seconds when not specified", () => {
    const config = createStagehandConfig(
      { provider: "local" },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.domSettleTimeout).toBe(30_000);
  });

  it("should use custom timeout when specified", () => {
    const config = createStagehandConfig(
      { provider: "local", defaults: { timeout: 60 } },
      { provider: "openrouter", apiKey: "sk-test", model: "test/model", maxTokens: 4096 },
    );

    expect(config.domSettleTimeout).toBe(60_000);
  });
});
