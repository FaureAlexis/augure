import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

describe("augure doctor", () => {
  it("should show help with --help", async () => {
    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;
    const { stdout } = await run("node", [binPath, "doctor", "--help"]);
    expect(stdout).toContain("Check configuration and connectivity");
    expect(stdout).toContain("--config");
  });

  it("should report invalid config gracefully", async () => {
    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;
    const { stdout } = await run("node", [binPath, "doctor", "--config", "/nonexistent/augure.json5"]);
    expect(stdout).toContain("Config invalid");
  }, 15_000);
});
