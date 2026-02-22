import { describe, it, expect, afterAll } from "vitest";
import Dockerode from "dockerode";
import { DockerContainerPool } from "../pool.js";

const docker = new Dockerode();
let isDockerAvailable = false;

try {
  await docker.ping();
  isDockerAvailable = true;
} catch {
  // Docker not available — skip
}

describe.skipIf(!isDockerAvailable)("integration: real Docker", () => {
  const pool = new DockerContainerPool(docker, {
    image: "node:22-slim",
    maxTotal: 2,
  });

  afterAll(async () => {
    await pool.destroyAll();
  });

  it("should create a container and exec a command", async () => {
    const container = await pool.acquire({
      trust: "sandboxed",
      timeout: 10,
      memory: "256m",
      cpu: "0.5",
    });
    const result = await container.exec("echo hello");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    await pool.release(container);
  }, 30_000);

  it("should verify network isolation for sandboxed", async () => {
    const container = await pool.acquire({
      trust: "sandboxed",
      timeout: 10,
      memory: "256m",
      cpu: "0.5",
    });
    const result = await container.exec(
      "curl -s --max-time 2 https://example.com || echo NETWORK_BLOCKED",
    );
    expect(result.stdout).toContain("NETWORK_BLOCKED");
    await pool.release(container);
  }, 30_000);

  it("should timeout on long-running commands", async () => {
    const container = await pool.acquire({
      trust: "sandboxed",
      timeout: 30,
      memory: "256m",
      cpu: "0.5",
    });
    await expect(
      container.exec("sleep 60", { timeout: 2 }),
    ).rejects.toThrow(/timed out/i);
    await pool.destroy(container);
  }, 30_000);
});
