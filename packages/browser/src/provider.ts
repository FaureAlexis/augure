import type { BrowserConfig, LLMModelConfig } from "@augure/types";

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
};

export interface StagehandConfig {
  env: "LOCAL" | "BROWSERBASE";
  apiKey?: string;
  projectId?: string;
  model: { modelName: string; apiKey: string; baseURL?: string };
  localBrowserLaunchOptions?: {
    headless: boolean;
    viewport: { width: number; height: number };
  };
  domSettleTimeout: number;
  verbose: 0;
}

export function createStagehandConfig(
  config: BrowserConfig,
  llm: LLMModelConfig,
): StagehandConfig {
  const baseURL = PROVIDER_BASE_URLS[llm.provider];

  return {
    env: config.provider === "local" ? "LOCAL" : "BROWSERBASE",
    apiKey: config.browserbase?.apiKey,
    projectId: config.browserbase?.projectId,
    model: {
      modelName: llm.model,
      apiKey: llm.apiKey,
      ...(baseURL ? { baseURL } : {}),
    },
    localBrowserLaunchOptions:
      config.provider === "local"
        ? {
            headless: config.defaults?.headless ?? true,
            viewport: config.defaults?.viewport ?? { width: 1280, height: 720 },
          }
        : undefined,
    domSettleTimeout: (config.defaults?.timeout ?? 30) * 1000,
    verbose: 0,
  };
}
