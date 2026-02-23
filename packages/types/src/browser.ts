export interface BrowserConfig {
  provider: "local" | "browserbase";
  browserbase?: {
    apiKey: string;
    projectId?: string;
  };
  defaults?: {
    timeout?: number;
    headless?: boolean;
    viewport?: { width: number; height: number };
  };
}

export interface BrowserSessionApi {
  navigate(url: string): Promise<void>;
  act(
    instruction: string,
    variables?: Record<string, string>,
  ): Promise<{ success: boolean; message: string }>;
  extract(
    instruction: string,
    schema?: Record<string, unknown>,
  ): Promise<unknown>;
  observe(
    instruction: string,
  ): Promise<Array<{ description: string; selector: string }>>;
  screenshot(): Promise<string>;
}
