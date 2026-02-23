import { describe, it, expect, vi } from "vitest";
import type { Container, ContainerPool } from "@augure/types";
import { ToolRegistry } from "@augure/tools";
import { DockerExecutor } from "../docker-sandbox.js";

function mockContainer(
  execResults: Array<{ stdout: string; stderr: string; exitCode: number }>,
): Container {
  let callIndex = 0;
  return {
    id: "test-container",
    status: "idle",
    exec: vi.fn(async () => {
      const result = execResults[callIndex] ?? {
        stdout: "",
        stderr: "",
        exitCode: 0,
      };
      callIndex++;
      return result;
    }),
    stop: vi.fn(async () => {}),
  } as unknown as Container;
}

function mockPool(container: Container): ContainerPool {
  return {
    acquire: vi.fn(async () => container),
    release: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    destroyAll: vi.fn(async () => {}),
    stats: vi.fn(() => ({ idle: 0, busy: 1, total: 1, maxTotal: 3 })),
  } as unknown as ContainerPool;
}

function createConfig(pool: ContainerPool) {
  return {
    registry: new ToolRegistry(),
    pool,
    timeout: 120,
    memoryLimit: "512m",
    cpuLimit: "1.0",
  };
}

describe("DockerExecutor", () => {
  it("should write harness and code to container, execute, and parse JSON result", async () => {
    const jsonOutput = JSON.stringify({
      success: true,
      output: "hello world",
      logs: ["log line"],
      toolCalls: 0,
    });
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir
      { stdout: "", stderr: "", exitCode: 0 }, // write user-code.js
      { stdout: "", stderr: "", exitCode: 0 }, // write harness.ts
      { stdout: jsonOutput, stderr: "", exitCode: 0 }, // npx tsx
    ]);
    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute('return "hello world";');

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello world");
    expect(result.logs).toEqual(["log line"]);
    expect(result.toolCalls).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify container interactions
    expect(pool.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ trust: "sandboxed" }),
    );
    expect(container.exec).toHaveBeenCalledTimes(4);

    // Verify base64 file injection pattern for user code
    const execCalls = (container.exec as ReturnType<typeof vi.fn>).mock.calls;
    expect(execCalls[0][0]).toBe("mkdir -p /workspace");
    expect(execCalls[1][0]).toMatch(
      /sh -c 'echo ".*" \| base64 -d > \/workspace\/user-code\.js'/,
    );
    expect(execCalls[2][0]).toMatch(
      /sh -c 'echo ".*" \| base64 -d > \/workspace\/harness\.ts'/,
    );
    expect(execCalls[3][0]).toBe("npx tsx /workspace/harness.ts");

    // Verify container was released
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should return error when container exec fails with non-zero exit code", async () => {
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir
      { stdout: "", stderr: "", exitCode: 0 }, // write user-code.js
      { stdout: "", stderr: "", exitCode: 0 }, // write harness.ts
      { stdout: "", stderr: "SyntaxError: unexpected token", exitCode: 1 }, // npx tsx
    ]);
    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute("invalid code {{{{");

    expect(result.success).toBe(false);
    expect(result.error).toContain("SyntaxError: unexpected token");
    expect(result.toolCalls).toBe(0);
  });

  it("should release container even when exec throws an error", async () => {
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir
      { stdout: "", stderr: "", exitCode: 0 }, // write user-code.js
      { stdout: "", stderr: "", exitCode: 0 }, // write harness.ts
    ]);
    // Override the 4th call to throw
    let callCount = 0;
    (container.exec as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        callCount++;
        if (callCount <= 3) {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        throw new Error("Container exec crashed");
      },
    );
    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute('return "test";');

    expect(result.success).toBe(false);
    expect(result.error).toContain("Container exec crashed");
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should return error when pool acquire fails", async () => {
    const container = mockContainer([]);
    const pool = mockPool(container);
    (pool.acquire as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Pool exhausted"),
    );
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute('return "test";');

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to acquire container");
    expect(result.error).toContain("Pool exhausted");
    expect(result.toolCalls).toBe(0);
    // release should NOT be called since we never acquired
    expect(pool.release).not.toHaveBeenCalled();
  });

  it("should handle harness JSON with toolCalls count", async () => {
    const jsonOutput = JSON.stringify({
      success: true,
      output: "result",
      logs: [],
      toolCalls: 3,
    });
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: jsonOutput, stderr: "", exitCode: 0 },
    ]);
    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute(
      "await api.foo(); await api.bar(); await api.baz(); return 'result';",
    );

    expect(result.success).toBe(true);
    expect(result.toolCalls).toBe(3);
  });

  it("should parse last line of stdout when there are multiple lines", async () => {
    const jsonOutput = JSON.stringify({
      success: true,
      output: 42,
      logs: ["debug info"],
      toolCalls: 0,
    });
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      {
        stdout: "some npm warning\n" + jsonOutput,
        stderr: "",
        exitCode: 0,
      },
    ]);
    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute("return 42;");

    expect(result.success).toBe(true);
    expect(result.output).toBe(42);
    expect(result.logs).toEqual(["debug info"]);
  });

  it("should handle harness reporting an error in JSON", async () => {
    const jsonOutput = JSON.stringify({
      success: false,
      error: "ReferenceError: x is not defined",
      logs: ["before error"],
      toolCalls: 0,
    });
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: jsonOutput, stderr: "", exitCode: 0 },
    ]);
    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute("return x;");

    expect(result.success).toBe(false);
    expect(result.error).toContain("ReferenceError");
    expect(result.logs).toEqual(["before error"]);
  });
});
