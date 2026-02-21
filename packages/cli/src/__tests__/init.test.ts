import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("augure init", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "augure-init-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should create augure.json5 and .env", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);

    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;
    await run("node", [binPath, "init"], { cwd: dir });

    const config = await readFile(join(dir, "augure.json5"), "utf-8");
    const env = await readFile(join(dir, ".env"), "utf-8");

    expect(config).toContain("identity");
    expect(config).toContain("OPENROUTER_API_KEY");
    expect(env).toContain("OPENROUTER_API_KEY");
  });

  it("should not overwrite existing config", async () => {
    await writeFile(join(dir, "augure.json5"), "existing", "utf-8");

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);

    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;
    const { stdout } = await run("node", [binPath, "init"], { cwd: dir });

    expect(stdout).toContain("already exists");

    const content = await readFile(join(dir, "augure.json5"), "utf-8");
    expect(content).toBe("existing");
  });
});
