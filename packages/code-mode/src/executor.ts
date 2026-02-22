export interface CodeModeResult {
  success: boolean;
  output: unknown;
  logs: string[];
  error?: string;
  durationMs: number;
  toolCalls: number;
}

export interface CodeModeExecutor {
  execute(code: string): Promise<CodeModeResult>;
}
