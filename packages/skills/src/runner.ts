import type {
  ContainerPool,
  Container,
  SkillRunResult,
} from "@augure/types";
import type { SkillManager } from "./manager.js";

export interface SkillRunnerConfig {
  pool: ContainerPool;
  manager: SkillManager;
  defaults: {
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
  browserManager?: {
    open(url?: string): Promise<string>;
    navigate(sessionId: string, url: string): Promise<void>;
    act(sessionId: string, instruction: string, variables?: Record<string, string>): Promise<{ success: boolean; message: string }>;
    extract(sessionId: string, instruction: string, schema?: Record<string, unknown>): Promise<unknown>;
    observe(sessionId: string, instruction: string): Promise<Array<{ description: string; selector: string }>>;
    screenshot(sessionId: string): Promise<string>;
    close(sessionId: string): Promise<void>;
  };
}

const HARNESS_TEMPLATE = `
import skill from "./skill.ts";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Load injected config from separate JSON file (avoids template injection issues)
const __injected = JSON.parse(await readFile("/workspace/__config.json", "utf-8"));

const ctx = {
  exec: async (command, opts) => {
    const { execSync } = await import("node:child_process");
    try {
      const stdout = execSync(command, {
        encoding: "utf-8",
        timeout: (opts?.timeout ?? 30) * 1000,
        env: { ...process.env, ...(opts?.env ?? {}) },
        maxBuffer: 10 * 1024 * 1024,
      });
      return { exitCode: 0, stdout, stderr: "" };
    } catch (err) {
      return {
        exitCode: err.status ?? 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? err.message,
      };
    }
  },
  memory: {
    read: async (path) => readFile(join("/memory", path), "utf-8"),
    list: async (dir) => {
      try {
        return await readdir(join("/memory", dir ?? ""));
      } catch {
        return [];
      }
    },
  },
  state: {
    _data: {},
    _loaded: false,
    _load: async function() {
      if (this._loaded) return;
      try { this._data = JSON.parse(await readFile("/state/state.json", "utf-8")); } catch { this._data = {}; }
      this._loaded = true;
    },
    get: async function(key) { await this._load(); return this._data[key]; },
    set: async function(key, value) {
      await this._load();
      this._data[key] = value;
      await mkdir("/state", { recursive: true });
      await writeFile("/state/state.json", JSON.stringify(this._data, null, 2));
    },
    delete: async function(key) {
      await this._load();
      delete this._data[key];
      await mkdir("/state", { recursive: true });
      await writeFile("/state/state.json", JSON.stringify(this._data, null, 2));
    },
  },
  previousRun: __injected.previousRun,
  config: __injected.config,
};

try {
  const result = await skill(ctx);
  console.log(JSON.stringify({ success: true, output: result?.output ?? "" }));
} catch (err) {
  console.log(JSON.stringify({ success: false, error: err.message ?? String(err) }));
  process.exit(1);
}
`;

export class SkillRunner {
  constructor(private readonly config: SkillRunnerConfig) {}

  async run(skillId: string): Promise<SkillRunResult> {
    const start = Date.now();
    const timestamp = new Date().toISOString();
    const skill = await this.config.manager.get(skillId);

    if (!skill.code) {
      const result: SkillRunResult = {
        skillId,
        timestamp,
        success: false,
        error: "Skill has no code (skill.ts)",
        durationMs: Date.now() - start,
      };
      await this.config.manager.saveRun(result);
      return result;
    }

    let container: Container;
    try {
      container = await this.config.pool.acquire({
        trust: skill.meta.sandbox ? "sandboxed" : "trusted",
        timeout: this.config.defaults.timeout,
        memory: this.config.defaults.memoryLimit,
        cpu: this.config.defaults.cpuLimit,
      });
    } catch (err) {
      const result: SkillRunResult = {
        skillId,
        timestamp,
        success: false,
        error: `Failed to acquire container: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
      await this.config.manager.saveRun(result);
      return result;
    }

    try {
      // Write files to container using base64 to avoid shell injection
      await container.exec("mkdir -p /workspace");
      const codeB64 = Buffer.from(skill.code).toString("base64");
      await container.exec(`sh -c 'echo "${codeB64}" | base64 -d > /workspace/skill.ts'`);

      // Write injected config as separate JSON file (avoids template string injection)
      const previousRun = await this.config.manager.getLastRun(skillId);
      const configData = JSON.stringify({ previousRun, config: skill.meta });
      const configB64 = Buffer.from(configData).toString("base64");
      await container.exec(`sh -c 'echo "${configB64}" | base64 -d > /workspace/__config.json'`);

      const harnessB64 = Buffer.from(HARNESS_TEMPLATE).toString("base64");
      await container.exec(`sh -c 'echo "${harnessB64}" | base64 -d > /workspace/harness.ts'`);

      // Execute
      const execResult = await container.exec(
        "npx tsx /workspace/harness.ts",
        { timeout: this.config.defaults.timeout, cwd: "/workspace" },
      );

      // Parse result
      let success = false;
      let output = "";
      let error: string | undefined;

      if (execResult.exitCode === 0 && execResult.stdout.trim()) {
        try {
          const parsed = JSON.parse(execResult.stdout.trim().split("\n").pop()!);
          success = parsed.success === true;
          output = parsed.output ?? "";
          error = parsed.error;
        } catch {
          output = execResult.stdout;
          success = true;
        }
      } else {
        success = false;
        error = execResult.stderr || execResult.stdout || "Unknown error";
      }

      const result: SkillRunResult = {
        skillId,
        timestamp,
        success,
        output: output || undefined,
        error,
        durationMs: Date.now() - start,
      };

      await this.config.manager.saveRun(result);
      return result;
    } catch (err) {
      const result: SkillRunResult = {
        skillId,
        timestamp,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
      await this.config.manager.saveRun(result);
      return result;
    } finally {
      await this.config.pool.release(container);
    }
  }
}
