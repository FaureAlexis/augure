// Placeholder — implemented in Task 4
export interface BrowserSessionManagerConfig {
  config: import("@augure/types").BrowserConfig;
  llm: import("@augure/types").LLMModelConfig;
  ttlMs?: number;
  logger?: import("@augure/types").Logger;
}

export class BrowserSessionManager {
  constructor(_opts: BrowserSessionManagerConfig) {}
}
