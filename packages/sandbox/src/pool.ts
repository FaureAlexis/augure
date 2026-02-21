import type Dockerode from "dockerode";
import type {
  Container,
  ContainerOpts,
  ContainerPool,
  PoolStats,
} from "@augure/types";
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

  private readonly idle = new Set<Container>();
  private readonly busy = new Set<Container>();

  constructor(
    docker: Dockerode,
    config: { image: string; maxTotal: number },
  ) {
    this.docker = docker;
    this.image = config.image;
    this.maxTotal = config.maxTotal;
  }

  /* ---- acquire ---- */

  async acquire(opts: ContainerOpts): Promise<Container> {
    // 1. Check idle cache first
    const cached = this.idle.values().next();
    if (!cached.done) {
      const container = cached.value;
      this.idle.delete(container);
      this.busy.add(container);
      return container;
    }

    // 2. If we still have capacity, create a new container
    const total = this.idle.size + this.busy.size;
    if (total >= this.maxTotal) {
      throw new Error("Pool limit reached");
    }

    const raw = await this.docker.createContainer(
      this.buildCreateOpts(opts),
    );
    await raw.start();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modem = (this.docker as any).modem;
    const demux = modem.demuxStream.bind(modem);

    const container = new DockerContainer(raw, demux);
    this.busy.add(container);
    return container;
  }

  /* ---- release ---- */

  async release(container: Container): Promise<void> {
    this.busy.delete(container);

    if (container.status === "stopped") {
      // Tainted -- don't cache
      return;
    }

    this.idle.add(container);
  }

  /* ---- destroy ---- */

  async destroy(container: Container): Promise<void> {
    this.busy.delete(container);
    this.idle.delete(container);
    await container.stop();
  }

  /* ---- destroyAll ---- */

  async destroyAll(): Promise<void> {
    const all = [...this.busy, ...this.idle];
    this.busy.clear();
    this.idle.clear();

    await Promise.all(all.map((c) => c.stop()));
  }

  /* ---- stats ---- */

  stats(): PoolStats {
    return {
      idle: this.idle.size,
      busy: this.busy.size,
      total: this.idle.size + this.busy.size,
      maxTotal: this.maxTotal,
    };
  }

  /* ---- internal ---- */

  private buildCreateOpts(opts: ContainerOpts): Dockerode.ContainerCreateOptions {
    const isSandboxed = opts.trust === "sandboxed";

    const hostConfig: Dockerode.HostConfig = {
      Memory: parseMemory(opts.memory),
      NanoCpus: parseCpu(opts.cpu),
    };

    if (!isSandboxed) {
      hostConfig.NetworkMode = "host";
    }

    return {
      Image: this.image,
      Cmd: ["sleep", "infinity"],
      WorkingDir: "/workspace",
      NetworkDisabled: isSandboxed,
      HostConfig: hostConfig,
    };
  }
}
