import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import type Dockerode from "dockerode";
import { DockerContainer } from "../container.js";

/**
 * Helper: build a fake dockerode Container with the exec/stop/remove flow.
 *
 * The `onDemux` callback receives (stdout, stderr) PassThrough streams so
 * the test can push data into them and end them to simulate real output.
 */
function makeFakeRaw(opts: {
  id?: string;
  exitCode?: number;
  onDemux?: (stdout: PassThrough, stderr: PassThrough) => void;
}) {
  const {
    id = "abc123",
    exitCode = 0,
    onDemux = (stdout, stderr) => {
      stdout.end();
      stderr.end();
    },
  } = opts;

  const fakeStream = new PassThrough();

  const execObj = {
    start: vi.fn().mockResolvedValue(fakeStream),
    inspect: vi.fn().mockResolvedValue({ ExitCode: exitCode }),
  };

  const raw = {
    id,
    exec: vi.fn().mockResolvedValue(execObj),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  // The demux function writes to the provided stdout/stderr PassThroughs
  // then ends the source stream so the "end" listener fires.
  const demux: (
    stream: NodeJS.ReadableStream,
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => void = (_stream, stdout, stderr) => {
    onDemux(stdout as PassThrough, stderr as PassThrough);
  };

  return { raw, execObj, fakeStream, demux };
}

describe("DockerContainer", () => {
  it("should expose container id and start with idle status", () => {
    const { raw, demux } = makeFakeRaw({ id: "container-42" });
    const container = new DockerContainer(raw as unknown as Dockerode.Container, demux);

    expect(container.id).toBe("container-42");
    expect(container.status).toBe("idle");
  });

  it("should exec a command and return stdout/stderr/exitCode", async () => {
    const { raw, demux } = makeFakeRaw({
      exitCode: 0,
      onDemux: (stdout, stderr) => {
        stdout.write("hello world\n");
        stdout.end();
        stderr.write("some warning\n");
        stderr.end();
      },
    });

    const container = new DockerContainer(raw as unknown as Dockerode.Container, demux);
    const result = await container.exec("echo hello");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello world\n");
    expect(result.stderr).toBe("some warning\n");

    // Verify dockerode was called correctly
    expect(raw.exec).toHaveBeenCalledWith({
      Cmd: ["sh", "-c", "echo hello"],
      AttachStdout: true,
      AttachStderr: true,
    });
  });

  it("should pass WorkingDir and Env when provided in opts", async () => {
    const { raw, demux } = makeFakeRaw({
      exitCode: 0,
      onDemux: (stdout, stderr) => {
        stdout.end();
        stderr.end();
      },
    });

    const container = new DockerContainer(raw as unknown as Dockerode.Container, demux);
    await container.exec("ls", {
      cwd: "/app",
      env: { NODE_ENV: "test", DEBUG: "1" },
    });

    expect(raw.exec).toHaveBeenCalledWith({
      Cmd: ["sh", "-c", "ls"],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: "/app",
      Env: ["NODE_ENV=test", "DEBUG=1"],
    });
  });

  it("should set status to busy during exec, idle after", async () => {
    const statusLog: string[] = [];
    let resolveDemux!: () => void;
    const demuxDone = new Promise<void>((r) => (resolveDemux = r));

    const { raw, demux } = makeFakeRaw({
      onDemux: (stdout, stderr) => {
        // Don't end streams immediately -- let the test observe "busy" first
        demuxDone.then(() => {
          stdout.end();
          stderr.end();
        });
      },
    });

    const container = new DockerContainer(raw as unknown as Dockerode.Container, demux);
    statusLog.push(container.status); // idle

    const execPromise = container.exec("work");
    // Yield so the exec body runs up to awaiting the stream
    await new Promise((r) => setTimeout(r, 10));
    statusLog.push(container.status); // busy

    resolveDemux();
    await execPromise;
    statusLog.push(container.status); // idle

    expect(statusLog).toEqual(["idle", "busy", "idle"]);
  });

  it("should reject if exec timeout exceeded", async () => {
    const { raw, demux } = makeFakeRaw({
      onDemux: () => {
        // Never end the streams -- simulates a hanging command
      },
    });

    const container = new DockerContainer(raw as unknown as Dockerode.Container, demux);
    await expect(container.exec("sleep 999", { timeout: 50 })).rejects.toThrow(
      /timed out/i,
    );

    // Status should return to idle after timeout
    expect(container.status).toBe("idle");
  });

  it("should stop and remove the container", async () => {
    const { raw, demux } = makeFakeRaw({});
    const container = new DockerContainer(raw as unknown as Dockerode.Container, demux);

    await container.stop();

    expect(raw.stop).toHaveBeenCalledWith({ t: 5 });
    expect(raw.remove).toHaveBeenCalledWith({ force: true });
    expect(container.status).toBe("stopped");
  });

  it("should truncate output at 1 MB", async () => {
    const big = Buffer.alloc(1024 * 1024 + 500, "x"); // slightly over 1 MB

    const { raw, demux } = makeFakeRaw({
      onDemux: (stdout, stderr) => {
        stdout.write(big);
        stdout.end();
        stderr.end();
      },
    });

    const container = new DockerContainer(raw as unknown as Dockerode.Container, demux);
    const result = await container.exec("cat bigfile");

    expect(result.stdout.length).toBeLessThanOrEqual(1024 * 1024);
    expect(result.stderr).toBe("");
  });
});
