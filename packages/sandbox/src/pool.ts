import type Dockerode from "dockerode";
import type {
  Container,
  ContainerOpts,
  ContainerPool,
  PoolStats,
  Logger,
} from "@augure/types";
import { noopLogger } from "@augure/types";
import { DockerContainer } from "./container.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a human-readable memory string into bytes.
 *
 *   "512m" -> 536_870_912
 *   "1g"   -> 1_073_741_824
 */
export function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+(?:\.\d+)?)\s*([mg])$/i);
  if (!match) throw new Error(`Invalid memory value: ${mem}`);
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m") return Math.round(value * 1024 * 1024);
  /* unit === "g" */
  return Math.round(value * 1024 * 1024 * 1024);
}

/**
 * Parse a CPU string into Docker NanoCpus.
 *
 *   "1.0" -> 1_000_000_000
 *   "0.5" -> 500_000_000
 */
export function parseCpu(cpu: string): number {
  const value = parseFloat(cpu);
  if (Number.isNaN(value)) throw new Error(`Invalid cpu value: ${cpu}`);
  return Math.round(value * 1e9);
}

/* ------------------------------------------------------------------ */
/*  DockerContainerPool                                                */
/* ------------------------------------------------------------------ */

export class DockerContainerPool implements ContainerPool {
  private readonly docker: Dockerode;
  private readonly image: string;
  private readonly maxTotal: number;
  private readonly log: Logger;

  // C3: idle cache keyed by trust level to prevent cross-trust reuse
  private readonly idle = new Map<string, Set<Container>>([
    ["sandboxed", new Set()],
    ["trusted", new Set()],
  ]);
  private readonly busy = new Set<Container>();
  private readonly containerTrust = new Map<string, "sandboxed" | "trusted">();

  constructor(
    docker: Dockerode,
    config: { image: string; maxTotal: number; logger?: Logger },
  ) {
    this.docker = docker;
    this.image = config.image;
    this.maxTotal = config.maxTotal;
    this.log = config.logger ?? noopLogger;
  }

  private get idleCount(): number {
    let count = 0;
    for (const set of this.idle.values()) count += set.size;
    return count;
  }

  /* ---- acquire ---- */

  async acquire(opts: ContainerOpts): Promise<Container> {
    this.log.debug(`Acquiring container: trust=${opts.trust} memory=${opts.memory} cpu=${opts.cpu}`);

    // 1. Check idle cache for matching trust level
    const trustIdle = this.idle.get(opts.trust)!;
    const cached = trustIdle.values().next();
    if (!cached.done) {
      const container = cached.value;
      trustIdle.delete(container);
      this.busy.add(container);
      this.log.debug(`Reusing cached container: ${container.id.slice(0, 12)}`);
      return container;
    }

    // 2. If we still have capacity, create a new container
    const total = this.idleCount + this.busy.size;
    if (total >= this.maxTotal) {
      this.log.error(`Pool limit reached: ${total}/${this.maxTotal}`);
      throw new Error("Pool limit reached");
    }

    this.log.debug("Creating new container...");
    const raw = await this.docker.createContainer(
      this.buildCreateOpts(opts),
    );
    await raw.start();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modem = (this.docker as any).modem;
    const demux = modem.demuxStream.bind(modem);

    const container = new DockerContainer(raw, demux);
    this.containerTrust.set(container.id, opts.trust);
    this.busy.add(container);
    this.log.debug(`Container created: ${container.id.slice(0, 12)}`);
    return container;
  }

  /* ---- release ---- */

  async release(container: Container): Promise<void> {
    this.busy.delete(container);

    if (container.status === "stopped") {
      this.containerTrust.delete(container.id);
      return;
    }

    const trust = this.containerTrust.get(container.id) ?? "sandboxed";
    this.idle.get(trust)!.add(container);
    this.log.debug(`Container released: ${container.id.slice(0, 12)} → idle (${trust})`);
  }

  /* ---- destroy ---- */

  async destroy(container: Container): Promise<void> {
    this.busy.delete(container);
    for (const set of this.idle.values()) set.delete(container);
    this.containerTrust.delete(container.id);
    await container.stop();
  }

  /* ---- destroyAll ---- */

  async destroyAll(): Promise<void> {
    const all = [...this.busy];
    for (const set of this.idle.values()) {
      all.push(...set);
      set.clear();
    }
    this.busy.clear();
    this.containerTrust.clear();

    // I2: allSettled so one failure doesn't orphan the rest
    await Promise.allSettled(all.map((c) => c.stop()));
  }

  /* ---- stats ---- */

  stats(): PoolStats {
    const idle = this.idleCount;
    return {
      idle,
      busy: this.busy.size,
      total: idle + this.busy.size,
      maxTotal: this.maxTotal,
    };
  }

  /* ---- internal ---- */

  private buildCreateOpts(opts: ContainerOpts): Dockerode.ContainerCreateOptions {
    const isSandboxed = opts.trust === "sandboxed";

    const hostConfig: Dockerode.HostConfig = {
      Memory: parseMemory(opts.memory),
      NanoCpus: parseCpu(opts.cpu),
      PidsLimit: 512, // I6: prevent fork bombs
    };

    if (!isSandboxed) {
      hostConfig.NetworkMode = "host";
    }

    // C2: pass mounts through to Docker
    if (opts.mounts?.length) {
      hostConfig.Binds = opts.mounts.map(
        (m) => `${m.host}:${m.container}${m.readonly ? ":ro" : ""}`,
      );
    }

    const createOpts: Dockerode.ContainerCreateOptions = {
      Image: this.image,
      Cmd: ["sleep", "infinity"],
      WorkingDir: "/workspace",
      NetworkDisabled: isSandboxed,
      HostConfig: hostConfig,
    };

    // C2: pass env through to Docker
    if (opts.env) {
      createOpts.Env = Object.entries(opts.env).map(
        ([k, v]) => `${k}=${v}`,
      );
    }

    return createOpts;
  }
}
