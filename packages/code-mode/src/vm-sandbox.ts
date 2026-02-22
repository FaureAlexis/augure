import { createContext, runInContext } from "node:vm";
import { transform } from "esbuild";
import type { ToolRegistry } from "@augure/tools";
import type { CodeModeExecutor, CodeModeResult } from "./executor.js";
import { createBridgeHandler, generateHarnessCode } from "./bridge.js";

export interface VmExecutorConfig {
  timeout: number;
  memoryLimit?: number;
}

export class VmExecutor implements CodeModeExecutor {
  private readonly registry: ToolRegistry;
  private readonly config: VmExecutorConfig;

  constructor(registry: ToolRegistry, config: VmExecutorConfig) {
    this.registry = registry;
    this.config = config;
  }

  async execute(code: string): Promise<CodeModeResult> {
    const start = performance.now();
    try {
      const harnessTs = generateHarnessCode(code);

      const { code: harnessJs } = await transform(harnessTs, {
        loader: "ts",
        target: "es2024",
      });

      const bridgeHandler = createBridgeHandler(this.registry);

      const consoleLogs: string[] = [];
      const captureConsole = {
        log: (...args: unknown[]) =>
          consoleLogs.push(args.map(String).join(" ")),
        warn: (...args: unknown[]) =>
          consoleLogs.push("[warn] " + args.map(String).join(" ")),
        error: (...args: unknown[]) =>
          consoleLogs.push("[error] " + args.map(String).join(" ")),
      };

      const context = createContext({
        console: captureConsole,
        __bridge: bridgeHandler,
        JSON,
        String,
        Number,
        Boolean,
        Array,
        Object,
        Error,
        Promise,
        Map,
        Set,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        setTimeout,
        Date,
        RegExp,
        Math,
        Symbol,
        Uint8Array,
        TextEncoder,
        TextDecoder,
        Buffer,
        URL,
        URLSearchParams,
      });

      const wrappedCode = `(async () => { ${harnessJs} })()`;

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error("Timeout: code execution exceeded time limit"),
            ),
          this.config.timeout,
        );
        timer.unref?.();
      });

      const resultPromise = runInContext(wrappedCode, context, {
        timeout: this.config.timeout,
      }) as Promise<unknown>;

      await Promise.race([resultPromise, timeoutPromise]);

      const durationMs = performance.now() - start;

      const lastLine = consoleLogs[consoleLogs.length - 1];
      if (!lastLine) {
        return {
          success: false,
          output: undefined,
          logs: consoleLogs,
          error: "No output produced by code execution",
          durationMs,
          toolCalls: 0,
        };
      }

      const parsed = JSON.parse(lastLine) as {
        success: boolean;
        output?: unknown;
        error?: string;
        logs: string[];
        toolCalls: number;
      };

      return {
        success: parsed.success,
        output: parsed.output,
        logs: parsed.logs,
        error: parsed.error,
        durationMs,
        toolCalls: parsed.toolCalls,
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      return {
        success: false,
        output: undefined,
        logs: [],
        error: err instanceof Error ? err.message : String(err),
        durationMs,
        toolCalls: 0,
      };
    }
  }
}
