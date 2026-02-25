import type { ContainerPool, Container } from "@augure/types";
import type { ToolRegistry } from "@augure/tools";
import type { CodeModeResult, CodeModeExecutor } from "./executor.js";

export interface DockerExecutorConfig {
  registry: ToolRegistry;
  pool: ContainerPool;
  timeout: number;
  memoryLimit: string;
  cpuLimit: string;
}

const DOCKER_HARNESS = `
import { readFile, writeFile, unlink } from "node:fs/promises";

const __logs = [];
const __originalLog = console.log;
console.log = (...args) => __logs.push(args.map(String).join(" "));
console.warn = (...args) => __logs.push("[warn] " + args.map(String).join(" "));
console.error = (...args) => __logs.push("[error] " + args.map(String).join(" "));

let __toolCalls = 0;
let __reqId = 0;

const __BRIDGE_TIMEOUT = 120_000;
const api = new Proxy({}, {
  get: (_target, toolName) => {
    return async (args) => {
      __toolCalls++;
      const id = String(++__reqId);
      const reqPath = \`/workspace/.bridge-req-\${id}.json\`;
      const respPath = \`/workspace/.bridge-resp-\${id}.json\`;
      await writeFile(reqPath, JSON.stringify({ id, tool: String(toolName), args }));
      const deadline = Date.now() + __BRIDGE_TIMEOUT;
      while (Date.now() < deadline) {
        try {
          const data = await readFile(respPath, "utf-8");
          await unlink(respPath);
          return JSON.parse(data);
        } catch {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      throw new Error(\`Bridge timeout: tool "\${String(toolName)}" did not respond within \${__BRIDGE_TIMEOUT}ms\`);
    };
  }
});

const __userCode = await readFile("/workspace/user-code.js", "utf-8");
const __fn = new Function("api", "__logs",
  "return (async () => { " + __userCode + " })();"
);

try {
  const __result = await __fn(api, __logs);
  __originalLog(JSON.stringify({
    success: true,
    output: __result,
    logs: __logs,
    toolCalls: __toolCalls,
  }));
} catch (err) {
  __originalLog(JSON.stringify({
    success: false,
    error: err.message ?? String(err),
    logs: __logs,
    toolCalls: __toolCalls,
  }));
}
`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseFiles(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("/workspace/.bridge-req-") && l.endsWith(".json"));
}

export class DockerExecutor implements CodeModeExecutor {
  private readonly config: DockerExecutorConfig;

  constructor(config: DockerExecutorConfig) {
    this.config = config;
  }

  private async pollBridge(container: Container, abortSignal: AbortSignal): Promise<void> {
    while (!abortSignal.aborted) {
      try {
        const ls = await container.exec(
          "ls /workspace/.bridge-req-*.json 2>/dev/null || true",
        );
        const files = parseFiles(ls.stdout);
        for (const reqFile of files) {
          const reqJson = await container.exec(`cat ${reqFile}`);
          const req = JSON.parse(reqJson.stdout) as {
            id: string;
            tool: string;
            args: unknown;
          };
          const result = await this.config.registry.execute(req.tool, req.args);
          const respFile = reqFile.replace("bridge-req", "bridge-resp");
          const respB64 = Buffer.from(JSON.stringify(result)).toString("base64");
          // Write via a temp file + rename to avoid partial reads and ARG_MAX limits
          const tmpFile = `${respFile}.tmp`;
          await container.exec(
            `sh -c 'echo "${respB64}" | base64 -d > ${tmpFile} && mv ${tmpFile} ${respFile}'`,
          );
          await container.exec(`rm ${reqFile}`);
        }
      } catch {
        // Container might have exited — poll loop will exit via abortSignal
      }
      await sleep(100);
    }
  }

  async execute(code: string): Promise<CodeModeResult> {
    const start = Date.now();

    let container: Container;
    try {
      container = await this.config.pool.acquire({
        trust: "sandboxed",
        timeout: this.config.timeout,
        memory: this.config.memoryLimit,
        cpu: this.config.cpuLimit,
      });
    } catch (err) {
      return {
        success: false,
        output: undefined,
        logs: [],
        toolCalls: 0,
        error: `Failed to acquire container: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
    }

    try {
      await container.exec("mkdir -p /workspace");

      const codeB64 = Buffer.from(code).toString("base64");
      await container.exec(
        `sh -c 'echo "${codeB64}" | base64 -d > /workspace/user-code.js'`,
      );

      const harnessB64 = Buffer.from(DOCKER_HARNESS).toString("base64");
      await container.exec(
        `sh -c 'echo "${harnessB64}" | base64 -d > /workspace/harness.ts'`,
      );

      // Run harness and bridge polling concurrently
      const abortController = new AbortController();
      const bridgePromise = this.pollBridge(container, abortController.signal);

      const execResult = await container.exec(
        "npx tsx /workspace/harness.ts",
        {
          timeout: this.config.timeout,
          cwd: "/workspace",
        },
      );

      // Harness finished — stop bridge polling
      abortController.abort();
      await bridgePromise;

      if (execResult.exitCode === 0 && execResult.stdout.trim()) {
        try {
          const lastLine = execResult.stdout.trim().split("\n").pop()!;
          const parsed = JSON.parse(lastLine) as {
            success: boolean;
            output?: unknown;
            error?: string;
            logs?: string[];
            toolCalls?: number;
          };
          return {
            success: parsed.success,
            output: parsed.output,
            logs: parsed.logs ?? [],
            error: parsed.error,
            durationMs: Date.now() - start,
            toolCalls: parsed.toolCalls ?? 0,
          };
        } catch {
          return {
            success: true,
            output: execResult.stdout.trim(),
            logs: [],
            durationMs: Date.now() - start,
            toolCalls: 0,
          };
        }
      }

      return {
        success: false,
        output: undefined,
        logs: [],
        toolCalls: 0,
        error: execResult.stderr || execResult.stdout || "Unknown error",
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        output: undefined,
        logs: [],
        toolCalls: 0,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    } finally {
      await this.config.pool.release(container);
    }
  }
}
