import { describe, it, expect, afterEach } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { writePid, readPid, isRunning, removePid, PID_FILE } from "../pid.js";

describe("PID utilities", () => {
  const tmp = mkdtempSync(join(tmpdir(), "augure-pid-"));
  const pidFile = join(tmp, PID_FILE);

  afterEach(async () => {
    try {
      await unlink(pidFile);
    } catch {
      /* may not exist */
    }
  });

  it("should write and read a PID file", async () => {
    await writePid(pidFile);
    const pid = await readPid(pidFile);
    expect(pid).toBe(process.pid);
  });

  it("should return null for missing PID file", async () => {
    const pid = await readPid(join(tmp, "nonexistent.pid"));
    expect(pid).toBeNull();
  });

  it("should detect running process", () => {
    expect(isRunning(process.pid)).toBe(true);
  });

  it("should detect non-running process", () => {
    // PID 99999999 is very unlikely to exist
    expect(isRunning(99999999)).toBe(false);
  });

  it("should remove PID file", async () => {
    await writeFile(pidFile, "12345", "utf-8");
    await removePid(pidFile);
    const pid = await readPid(pidFile);
    expect(pid).toBeNull();
  });

  it("should not throw when removing non-existent PID file", async () => {
    await expect(removePid(join(tmp, "gone.pid"))).resolves.toBeUndefined();
  });
});
