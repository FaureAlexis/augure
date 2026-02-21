export interface ContainerOpts {
  trust: "sandboxed" | "trusted";
  timeout: number;
  memory: string;
  cpu: string;
  env?: Record<string, string>;
  mounts?: VolumeMount[];
}

export interface VolumeMount {
  host: string;
  container: string;
  readonly?: boolean;
}

export interface ExecOpts {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Container {
  id: string;
  exec(command: string, opts?: ExecOpts): Promise<ExecResult>;
  stop(): Promise<void>;
  status: "idle" | "busy" | "stopped";
}

export interface PoolStats {
  idle: number;
  busy: number;
  total: number;
  maxTotal: number;
}

export interface ContainerPool {
  acquire(opts: ContainerOpts): Promise<Container>;
  release(container: Container): Promise<void>;
  destroy(container: Container): Promise<void>;
  destroyAll(): Promise<void>;
  stats(): PoolStats;
}
