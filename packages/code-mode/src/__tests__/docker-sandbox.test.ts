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

function createConfig(pool: ContainerPool, registry?: ToolRegistry) {
  return {
    registry: registry ?? new ToolRegistry(),
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
      { stdout: "", stderr: "", exitCode: 0 }, // bridge poll: ls (no files)
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

    // Verify base64 file injection pattern for user code
    const execCalls = (container.exec as ReturnType<typeof vi.fn>).mock.calls;
    expect(execCalls[0][0]).toBe("mkdir -p /workspace");
    expect(execCalls[1][0]).toMatch(
      /sh -c 'echo ".*" \| base64 -d > \/workspace\/user-code\.js'/,
    );
    expect(execCalls[2][0]).toMatch(
      /sh -c 'echo ".*" \| base64 -d > \/workspace\/harness\.ts'/,
    );

    // Verify container was released
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should return error when container exec fails with non-zero exit code", async () => {
    const container = mockContainer([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir
      { stdout: "", stderr: "", exitCode: 0 }, // write user-code.js
      { stdout: "", stderr: "", exitCode: 0 }, // write harness.ts
      { stdout: "", stderr: "", exitCode: 0 }, // bridge poll: ls
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
    // Override to throw on the 4th+ call
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
      { stdout: "", stderr: "", exitCode: 0 }, // bridge poll: ls
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
      { stdout: "", stderr: "", exitCode: 0 }, // bridge poll
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
      { stdout: "", stderr: "", exitCode: 0 }, // bridge poll
      { stdout: jsonOutput, stderr: "", exitCode: 0 },
    ]);
    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool));

    const result = await executor.execute("return x;");

    expect(result.success).toBe(false);
    expect(result.error).toContain("ReferenceError");
    expect(result.logs).toEqual(["before error"]);
  });

  it("should execute tool calls via file-based bridge", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "web_search",
      description: "search the web",
      parameters: {},
      execute: async (params) => ({
        success: true,
        output: `Results for: ${(params as { query: string }).query}`,
      }),
    });

    const bridgeReq = JSON.stringify({ id: "1", tool: "web_search", args: { query: "test" } });
    const harnessOutput = JSON.stringify({
      success: true,
      output: "search done",
      logs: [],
      toolCalls: 1,
    });

    // Use command-based routing since bridge poll and harness run concurrently
    let lsCallCount = 0;
    const container = {
      id: "bridge-container",
      status: "idle",
      exec: vi.fn(async (cmd: string) => {
        if (cmd === "mkdir -p /workspace") return { stdout: "", stderr: "", exitCode: 0 };
        // npx tsx must be checked before harness.ts since it contains "harness.ts"
        if (cmd.startsWith("npx tsx")) return { stdout: harnessOutput, stderr: "", exitCode: 0 };
        if (cmd.includes("user-code.js")) return { stdout: "", stderr: "", exitCode: 0 };
        if (cmd.includes("harness.ts")) return { stdout: "", stderr: "", exitCode: 0 };
        if (cmd.startsWith("ls /workspace/.bridge-req")) {
          lsCallCount++;
          if (lsCallCount === 1) return { stdout: "/workspace/.bridge-req-1.json\n", stderr: "", exitCode: 0 };
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (cmd.startsWith("cat /workspace/.bridge-req")) return { stdout: bridgeReq, stderr: "", exitCode: 0 };
        if (cmd.includes("bridge-resp")) return { stdout: "", stderr: "", exitCode: 0 };
        if (cmd.startsWith("rm ")) return { stdout: "", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
      stop: vi.fn(async () => {}),
    } as unknown as Container;

    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool, registry));

    const result = await executor.execute('const r = await api.web_search({ query: "test" }); return "search done";');

    expect(result.success).toBe(true);
    expect(result.output).toBe("search done");
    expect(result.toolCalls).toBe(1);
    expect(pool.release).toHaveBeenCalledWith(container);
  });

  it("should handle multiple bridge requests in sequence", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "tool_a",
      description: "tool A",
      parameters: {},
      execute: async () => ({ success: true, output: "result_a" }),
    });
    registry.register({
      name: "tool_b",
      description: "tool B",
      parameters: {},
      execute: async () => ({ success: true, output: "result_b" }),
    });

    const reqA = JSON.stringify({ id: "1", tool: "tool_a", args: {} });
    const reqB = JSON.stringify({ id: "2", tool: "tool_b", args: {} });
    const harnessOutput = JSON.stringify({
      success: true,
      output: "both done",
      logs: [],
      toolCalls: 2,
    });

    // Use command-based routing with a queue for ls results
    const lsResults = [
      "/workspace/.bridge-req-1.json\n",
      "/workspace/.bridge-req-2.json\n",
    ];
    let lsCallCount = 0;
    const catResults: Record<string, string> = {
      "cat /workspace/.bridge-req-1.json": reqA,
      "cat /workspace/.bridge-req-2.json": reqB,
    };

    const container = {
      id: "multi-bridge",
      status: "idle",
      exec: vi.fn(async (cmd: string) => {
        if (cmd === "mkdir -p /workspace") return { stdout: "", stderr: "", exitCode: 0 };
        // npx tsx must be checked before harness.ts since it contains "harness.ts"
        if (cmd.startsWith("npx tsx")) return { stdout: harnessOutput, stderr: "", exitCode: 0 };
        if (cmd.includes("user-code.js")) return { stdout: "", stderr: "", exitCode: 0 };
        if (cmd.includes("harness.ts")) return { stdout: "", stderr: "", exitCode: 0 };
        if (cmd.startsWith("ls /workspace/.bridge-req")) {
          const stdout = lsResults[lsCallCount] ?? "";
          lsCallCount++;
          return { stdout, stderr: "", exitCode: 0 };
        }
        if (cmd.startsWith("cat /workspace/.bridge-req")) {
          return { stdout: catResults[cmd] ?? "", stderr: "", exitCode: 0 };
        }
        if (cmd.includes("bridge-resp")) return { stdout: "", stderr: "", exitCode: 0 };
        if (cmd.startsWith("rm ")) return { stdout: "", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
      stop: vi.fn(async () => {}),
    } as unknown as Container;

    const pool = mockPool(container);
    const executor = new DockerExecutor(createConfig(pool, registry));

    const result = await executor.execute("await api.tool_a({}); await api.tool_b({}); return 'both done';");

    expect(result.success).toBe(true);
    expect(result.output).toBe("both done");
    expect(result.toolCalls).toBe(2);
  });
});
