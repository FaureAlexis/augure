import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const PID_FILE = ".augure.pid";

export function pidPath(configPath: string): string {
  return join(dirname(resolve(configPath)), PID_FILE);
}

export async function writePid(path: string): Promise<void> {
  await writeFile(path, String(process.pid), "utf-8");
}

export async function readPid(path: string): Promise<number | null> {
  try {
    const num = parseInt(await readFile(path, "utf-8"), 10);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function removePid(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    /* ignore */
  }
}
