import type { ContainerPool, Container, Skill, SkillTestResult } from "@augure/types";

export interface SkillTesterConfig {
  pool: ContainerPool;
  defaults: {
    timeout: number;
    memoryLimit: string;
    cpuLimit: string;
  };
}

export class SkillTester {
  constructor(private readonly config: SkillTesterConfig) {}

  async test(skill: Skill): Promise<SkillTestResult> {
    if (!skill.testCode) {
      return { success: false, passed: 0, failed: 0, output: "", error: "Skill has no test code" };
    }
    if (!skill.code) {
      return { success: false, passed: 0, failed: 0, output: "", error: "Skill has no code" };
    }

    let container: Container;
    try {
      container = await this.config.pool.acquire({
        trust: "sandboxed",
        timeout: this.config.defaults.timeout,
        memory: this.config.defaults.memoryLimit,
        cpu: this.config.defaults.cpuLimit,
      });
    } catch (err) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        output: "",
        error: `Failed to acquire container: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    try {
      // Write files using base64 to avoid shell injection
      await container.exec("mkdir -p /workspace");
      const codeB64 = Buffer.from(skill.code).toString("base64");
      await container.exec(`sh -c 'echo "${codeB64}" | base64 -d > /workspace/skill.ts'`);

      const testB64 = Buffer.from(skill.testCode).toString("base64");
      await container.exec(`sh -c 'echo "${testB64}" | base64 -d > /workspace/skill.test.ts'`);

      // Run tests using tsx for TypeScript support, TAP reporter for reliable parsing
      const result = await container.exec(
        "npx tsx --test --test-reporter=tap /workspace/skill.test.ts",
        { timeout: this.config.defaults.timeout, cwd: "/workspace" },
      );

      // Parse output for pass/fail counts
      const { passed, failed } = parseTestOutput(result.stdout + result.stderr);
      const success = result.exitCode === 0 && failed === 0;

      return {
        success,
        passed,
        failed,
        output: result.stdout,
        error: success ? undefined : (result.stderr || `Exit code: ${result.exitCode}`),
      };
    } catch (err) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await this.config.pool.release(container);
    }
  }
}

function parseTestOutput(output: string): { passed: number; failed: number } {
  // node:test reporter output format includes lines like:
  // # pass 3
  // # fail 1
  // # tests 4
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);
  return {
    passed: passMatch ? parseInt(passMatch[1], 10) : 0,
    failed: failMatch ? parseInt(failMatch[1], 10) : 0,
  };
}
