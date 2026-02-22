import { PassThrough } from "node:stream";
import type Dockerode from "dockerode";
import type {
  Container,
  ExecOpts,
  ExecResult,
} from "@augure/types";

/** 1 MB output cap (per stream). */
const MAX_OUTPUT_BYTES = 1024 * 1024;

type DemuxFn = (
  stream: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
) => void;

/**
 * Wraps a single dockerode `Container` to satisfy the `Container` interface
 * from `@augure/types`.
 *
 * Accepts an optional `demuxStream` function so tests can inject a mock
 * instead of relying on the real `Docker.prototype.modem.demuxStream`.
 */
export class DockerContainer implements Container {
  readonly id: string;
  private _status: "idle" | "busy" | "stopped" = "idle";
  private readonly raw: Dockerode.Container;
  private readonly demux: DemuxFn;

  constructor(raw: Dockerode.Container, demux: DemuxFn) {
    this.raw = raw;
    this.id = raw.id;
    this.demux = demux;
  }

  get status(): "idle" | "busy" | "stopped" {
    return this._status;
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    this._status = "busy";
    try {
      return await this._exec(command, opts);
    } finally {
      if ((this._status as string) !== "stopped") {
        this._status = "idle";
      }
    }
  }

  async stop(): Promise<void> {
    if (this._status === "stopped") return;
    try {
      await this.raw.stop({ t: 5 });
    } catch {
      // Container may already be stopped
    }
    try {
      await this.raw.remove({ force: true });
    } catch {
      // Container may already be removed
    }
    this._status = "stopped";
  }

  /* ------------------------------------------------------------------ */

  private async _exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    const createOpts: Dockerode.ExecCreateOptions = {
      Cmd: ["sh", "-c", command],
      AttachStdout: true,
      AttachStderr: true,
    };

    if (opts?.cwd) {
      createOpts.WorkingDir = opts.cwd;
    }
    if (opts?.env) {
      createOpts.Env = Object.entries(opts.env).map(
        ([k, v]) => `${k}=${v}`,
      );
    }

    const exec = await this.raw.exec(createOpts);
    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise<ExecResult>((resolve, reject) => {
      const stdoutPT = new PassThrough();
      const stderrPT = new PassThrough();

      const stdoutBufs: Buffer[] = [];
      const stderrBufs: Buffer[] = [];
      let stdoutLen = 0;
      let stderrLen = 0;

      stdoutPT.on("data", (chunk: Buffer) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_OUTPUT_BYTES - stdoutLen;
        if (remaining > 0) {
          stdoutBufs.push(buf.subarray(0, remaining));
          stdoutLen += Math.min(buf.length, remaining);
        }
      });

      stderrPT.on("data", (chunk: Buffer) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_OUTPUT_BYTES - stderrLen;
        if (remaining > 0) {
          stderrBufs.push(buf.subarray(0, remaining));
          stderrLen += Math.min(buf.length, remaining);
        }
      });

      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      let stdoutEnded = false;
      let stderrEnded = false;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
      };

      // C1: timeout is in seconds, convert to ms for setTimeout
      if (opts?.timeout && opts.timeout > 0) {
        const timeoutMs = opts.timeout * 1000;
        timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            stream.destroy();
            reject(new Error(`Exec timed out after ${opts.timeout}s`));
          }
        }, timeoutMs);
      }

      // I8: wait for both stdout and stderr to end before resolving
      const tryResolve = async () => {
        if (!stdoutEnded || !stderrEnded) return;
        if (settled) return;
        settled = true;
        cleanup();

        try {
          const info = await exec.inspect();
          resolve({
            exitCode: info.ExitCode ?? 1,
            stdout: Buffer.concat(stdoutBufs).toString("utf-8"),
            stderr: Buffer.concat(stderrBufs).toString("utf-8"),
          });
        } catch (err) {
          reject(err);
        }
      };

      stdoutPT.on("end", () => {
        stdoutEnded = true;
        tryResolve();
      });

      stderrPT.on("end", () => {
        stderrEnded = true;
        tryResolve();
      });

      // C4: handle stream errors
      stream.on("error", (err: Error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      });

      // Separate stdout and stderr from the multiplexed Docker stream.
      this.demux(stream, stdoutPT, stderrPT);
    });
  }
}
