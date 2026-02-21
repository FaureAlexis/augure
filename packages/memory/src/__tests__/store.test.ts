import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileMemoryStore } from "../store.js";

describe("FileMemoryStore", () => {
  let dir: string;
  let store: FileMemoryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "memory-test-"));
    store = new FileMemoryStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should write and read a file", async () => {
    await store.write("hello.txt", "world");
    const content = await store.read("hello.txt");
    expect(content).toBe("world");
  });

  it("should create nested directories on write", async () => {
    await store.write("a/b/c/deep.txt", "nested");
    const content = await store.read("a/b/c/deep.txt");
    expect(content).toBe("nested");
  });

  it("should append content to a file", async () => {
    await store.write("log.txt", "line1\n");
    await store.append("log.txt", "line2\n");
    const content = await store.read("log.txt");
    expect(content).toBe("line1\nline2\n");
  });

  it("should append to a non-existent file", async () => {
    await store.append("new.txt", "first");
    const content = await store.read("new.txt");
    expect(content).toBe("first");
  });

  it("should list files in a directory", async () => {
    await store.write("docs/a.txt", "a");
    await store.write("docs/b.txt", "b");
    await store.write("other.txt", "o");

    const files = await store.list("docs");
    expect(files.sort()).toEqual(["docs/a.txt", "docs/b.txt"]);
  });

  it("should list files recursively from root", async () => {
    await store.write("root.txt", "r");
    await store.write("sub/nested.txt", "n");

    const files = await store.list();
    expect(files.sort()).toEqual(["root.txt", "sub/nested.txt"]);
  });

  it("should return true for existing file", async () => {
    await store.write("present.txt", "yes");
    expect(await store.exists("present.txt")).toBe(true);
  });

  it("should return false for non-existent file", async () => {
    expect(await store.exists("missing.txt")).toBe(false);
  });

  it("should throw on read of non-existent file", async () => {
    await expect(store.read("nope.txt")).rejects.toThrow();
  });
});
