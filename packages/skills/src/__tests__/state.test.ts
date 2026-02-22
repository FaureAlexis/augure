import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileSkillState } from "../state.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "skill-state-"));
});

describe("FileSkillState", () => {
  it("should get/set/delete values", async () => {
    const state = new FileSkillState(join(dir, "state.json"));

    expect(await state.get("key")).toBeUndefined();

    await state.set("key", "value");
    expect(await state.get("key")).toBe("value");

    await state.delete("key");
    expect(await state.get("key")).toBeUndefined();
  });

  it("should persist to disk", async () => {
    const path = join(dir, "state.json");
    const state1 = new FileSkillState(path);
    await state1.set("hello", "world");

    const raw = await readFile(path, "utf-8");
    expect(JSON.parse(raw)).toEqual({ hello: "world" });
  });

  it("should load persisted state in new instance", async () => {
    const path = join(dir, "state.json");

    const state1 = new FileSkillState(path);
    await state1.set("persistent", "data");

    const state2 = new FileSkillState(path);
    expect(await state2.get("persistent")).toBe("data");
  });

  it("should handle missing file gracefully", async () => {
    const state = new FileSkillState(join(dir, "nonexistent", "state.json"));
    expect(await state.get("missing")).toBeUndefined();
  });

  it("should create parent directories on set", async () => {
    const state = new FileSkillState(join(dir, "deep", "nested", "state.json"));
    await state.set("key", "value");
    expect(await state.get("key")).toBe("value");
  });
});
