import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

describe("augure start", () => {
  it("should show help with --help", async () => {
    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;
    const { stdout } = await run("node", [binPath, "start", "--help"]);

    expect(stdout).toContain("Start the Augure agent");
    expect(stdout).toContain("--config");
  });

  it("should fail with a clean error for missing config", async () => {
    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;

    try {
      await run("node", [binPath, "start", "--config", "/nonexistent/augure.json5"]);
      expect.unreachable("should have thrown");
    } catch (err) {
      const error = err as { stderr: string; code: number };
      expect(error.stderr).toContain("Fatal error:");
    }
  });
});
