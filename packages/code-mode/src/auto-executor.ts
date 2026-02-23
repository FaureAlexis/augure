import type { CodeModeResult, CodeModeExecutor } from "./executor.js";

export class AutoExecutor implements CodeModeExecutor {
  constructor(
    private readonly primary: CodeModeExecutor,
    private readonly fallback: CodeModeExecutor,
  ) {}

  async execute(code: string): Promise<CodeModeResult> {
    try {
      const result = await this.primary.execute(code);
      // Don't fall back for transpile errors (same code would fail anywhere)
      // Don't fall back for normal code errors (user code bugs, not executor bugs)
      return result;
    } catch {
      // Primary executor itself crashed — fall back
      return this.fallback.execute(code);
    }
  }
}
