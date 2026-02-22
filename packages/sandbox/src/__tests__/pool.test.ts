import { describe, it, expect, vi, beforeEach } from "vitest";
import type Dockerode from "dockerode";
import { DockerContainerPool } from "../pool.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Minimal mock of a raw dockerode Container. */
function makeFakeRawContainer(id: string) {
  return {
    id,
    start: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({
      start: vi.fn().mockResolvedValue(undefined),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

/** Returns a fake Dockerode instance with createContainer that mints ids. */
function makeMockDocker() {
  let counter = 0;
  const containers: ReturnType<typeof makeFakeRawContainer>[] = [];

  const createContainer = vi.fn(async () => {
    const raw = makeFakeRawContainer(`ctr-${++counter}`);
    containers.push(raw);
    return raw;
  });

  const docker = {
    createContainer,
    modem: {
      demuxStream: vi.fn(),
    },
  };

  return { docker: docker as unknown as Dockerode, containers, createContainer };
}

/**
 * Retrieve the first `createContainer` call arg from the mock, typed as a
 * plain record.  Works around strict tuple typing on `mock.calls`.
 */
function firstCreateArg(
  mock: ReturnType<typeof vi.fn>,
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mock as any).mock.calls[0][0];
}

const baseOpts = {
  trust: "sandboxed" as const,
  timeout: 30,
  memory: "512m",
  cpu: "1.0",
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("DockerContainerPool", () => {
  let docker: Dockerode;
  let createContainer: ReturnType<typeof vi.fn>;
  let containers: ReturnType<typeof makeMockDocker>["containers"];

  beforeEach(() => {
    const mock = makeMockDocker();
    docker = mock.docker;
    createContainer = mock.createContainer;
    containers = mock.containers;
  });

  /* ---- 1. create new container when cache is empty ---- */
  it("should create a new container when cache is empty", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    const c = await pool.acquire(baseOpts);

    expect(c).toBeDefined();
    expect(c.id).toBe("ctr-1");
    expect(createContainer).toHaveBeenCalledTimes(1);
    expect(containers[0].start).toHaveBeenCalledTimes(1);
  });

  /* ---- 2. return cached container after release ---- */
  it("should return cached container after release", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    const c1 = await pool.acquire(baseOpts);
    await pool.release(c1);

    const c2 = await pool.acquire(baseOpts);

    // Same container returned from cache -- no new createContainer call
    expect(c2.id).toBe(c1.id);
    expect(createContainer).toHaveBeenCalledTimes(1);
  });

  /* ---- 3. respect maxTotal limit ---- */
  it("should respect maxTotal limit", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 2,
    });

    await pool.acquire(baseOpts);
    await pool.acquire(baseOpts);

    await expect(pool.acquire(baseOpts)).rejects.toThrow("Pool limit reached");
  });

  /* ---- 4. sandboxed container has NetworkDisabled: true ---- */
  it("should create sandboxed container with NetworkDisabled: true", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire({ ...baseOpts, trust: "sandboxed" });

    const createArg = firstCreateArg(createContainer);
    expect(createArg.NetworkDisabled).toBe(true);
  });

  /* ---- 5. trusted container has host network ---- */
  it("should create trusted container with host network", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire({ ...baseOpts, trust: "trusted" });

    const createArg = firstCreateArg(createContainer);
    expect(createArg.NetworkDisabled).toBe(false);

    const hostConfig = createArg.HostConfig as Record<string, unknown>;
    expect(hostConfig.NetworkMode).toBe("host");
  });

  /* ---- 6. destroy a container ---- */
  it("should destroy a container", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    const c = await pool.acquire(baseOpts);
    await pool.destroy(c);

    expect(containers[0].stop).toHaveBeenCalled();
    const stats = pool.stats();
    expect(stats.busy).toBe(0);
    expect(stats.idle).toBe(0);
    expect(stats.total).toBe(0);
  });

  /* ---- 7. destroyAll containers ---- */
  it("should destroyAll containers", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    const c1 = await pool.acquire(baseOpts);
    await pool.acquire(baseOpts); // c2 stays busy
    await pool.release(c1); // c1 is now idle

    await pool.destroyAll();

    expect(containers[0].stop).toHaveBeenCalled();
    expect(containers[1].stop).toHaveBeenCalled();
    const stats = pool.stats();
    expect(stats.busy).toBe(0);
    expect(stats.idle).toBe(0);
    expect(stats.total).toBe(0);
  });

  /* ---- 8. report correct stats ---- */
  it("should report correct stats", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    expect(pool.stats()).toEqual({ idle: 0, busy: 0, total: 0, maxTotal: 5 });

    const c1 = await pool.acquire(baseOpts);
    expect(pool.stats()).toEqual({ idle: 0, busy: 1, total: 1, maxTotal: 5 });

    const c2 = await pool.acquire(baseOpts);
    expect(pool.stats()).toEqual({ idle: 0, busy: 2, total: 2, maxTotal: 5 });

    await pool.release(c1);
    expect(pool.stats()).toEqual({ idle: 1, busy: 1, total: 2, maxTotal: 5 });

    await pool.destroy(c2);
    expect(pool.stats()).toEqual({ idle: 1, busy: 0, total: 1, maxTotal: 5 });

    await pool.destroyAll();
    expect(pool.stats()).toEqual({ idle: 0, busy: 0, total: 0, maxTotal: 5 });
  });

  /* ---- additional: release of stopped container should not cache ---- */
  it("should not cache a stopped container on release", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    const c = await pool.acquire(baseOpts);
    // Manually stop the container so its status becomes "stopped"
    await c.stop();

    await pool.release(c);

    const stats = pool.stats();
    // Stopped container should have been removed, not cached
    expect(stats.idle).toBe(0);
    expect(stats.busy).toBe(0);
    expect(stats.total).toBe(0);
  });

  /* ---- additional: memory and cpu parsing via HostConfig ---- */
  it("should pass correct Memory and NanoCpus in HostConfig", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire({
      trust: "sandboxed",
      timeout: 30_000,
      memory: "1g",
      cpu: "0.5",
    });

    const createArg = firstCreateArg(createContainer);
    const hostConfig = createArg.HostConfig as Record<string, unknown>;

    expect(hostConfig.Memory).toBe(1024 * 1024 * 1024); // 1 GB in bytes
    expect(hostConfig.NanoCpus).toBe(0.5e9);
  });

  /* ---- additional: container create options are correct ---- */
  it("should create container with correct Image, Cmd, and WorkingDir", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire(baseOpts);

    const createArg = firstCreateArg(createContainer);
    expect(createArg.Image).toBe("augure-sandbox:latest");
    expect(createArg.Cmd).toEqual(["sleep", "infinity"]);
    expect(createArg.WorkingDir).toBe("/workspace");
  });

  /* ---- C3: trust-keyed idle cache ---- */
  it("should NOT reuse sandboxed container for trusted request", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    const sandboxed = await pool.acquire({ ...baseOpts, trust: "sandboxed" });
    await pool.release(sandboxed);

    const trusted = await pool.acquire({ ...baseOpts, trust: "trusted" });
    // Should be a different container — not reused from sandboxed cache
    expect(trusted.id).not.toBe(sandboxed.id);
    expect(createContainer).toHaveBeenCalledTimes(2);
  });

  it("should reuse container with matching trust level", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    const c1 = await pool.acquire({ ...baseOpts, trust: "trusted" });
    await pool.release(c1);

    const c2 = await pool.acquire({ ...baseOpts, trust: "trusted" });
    expect(c2.id).toBe(c1.id);
    expect(createContainer).toHaveBeenCalledTimes(1);
  });

  /* ---- C2: env and mounts in buildCreateOpts ---- */
  it("should pass env to container create options", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire({
      ...baseOpts,
      env: { API_KEY: "secret", NODE_ENV: "production" },
    });

    const createArg = firstCreateArg(createContainer);
    expect(createArg.Env).toEqual(["API_KEY=secret", "NODE_ENV=production"]);
  });

  it("should pass mounts as Binds in HostConfig", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire({
      ...baseOpts,
      mounts: [
        { host: "/tmp/code", container: "/workspace", readonly: false },
        { host: "/data/models", container: "/models", readonly: true },
      ],
    });

    const createArg = firstCreateArg(createContainer);
    const hostConfig = createArg.HostConfig as Record<string, unknown>;
    expect(hostConfig.Binds).toEqual([
      "/tmp/code:/workspace",
      "/data/models:/models:ro",
    ]);
  });

  /* ---- I6: PidsLimit ---- */
  it("should set PidsLimit in HostConfig", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire(baseOpts);

    const createArg = firstCreateArg(createContainer);
    const hostConfig = createArg.HostConfig as Record<string, unknown>;
    expect(hostConfig.PidsLimit).toBe(512);
  });

  /* ---- I2: destroyAll uses allSettled ---- */
  it("should destroy all containers even if one stop fails", async () => {
    const pool = new DockerContainerPool(docker, {
      image: "augure-sandbox:latest",
      maxTotal: 5,
    });

    await pool.acquire(baseOpts);
    await pool.acquire(baseOpts);

    // Make first container's stop throw
    containers[0].stop.mockRejectedValueOnce(new Error("stop failed"));

    // destroyAll should not throw
    await pool.destroyAll();

    // Both containers should have had stop attempted
    expect(containers[0].stop).toHaveBeenCalled();
    expect(containers[1].stop).toHaveBeenCalled();
    expect(pool.stats().total).toBe(0);
  });
});
