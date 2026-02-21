import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryRetriever } from "../retrieve.js";
import { FileMemoryStore } from "../store.js";

describe("MemoryRetriever", () => {
  let dir: string;
  let store: FileMemoryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "retrieve-test-"));
    store = new FileMemoryStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should always include observations.md", async () => {
    await store.write("observations.md", "## 2026-02-21\n- User likes cats\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("User likes cats");
  });

  it("should always include identity.md", async () => {
    await store.write("identity.md", "Name: Alexis\nLocation: Bordeaux\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("Name: Alexis");
  });

  it("should include all available core memory files", async () => {
    await store.write("observations.md", "## 2026-02-21\n- Fact A\n");
    await store.write("identity.md", "User info\n");
    await store.write("preferences/communication.md", "Language: French\n");
    await store.write("context/active_tasks.md", "- Build Augure\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("Fact A");
    expect(result).toContain("User info");
    expect(result).toContain("Language: French");
    expect(result).toContain("Build Augure");
  });

  it("should label sections with file paths", async () => {
    await store.write("observations.md", "observations content\n");
    await store.write("preferences/interests.md", "interests content\n");

    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();

    expect(result).toContain("### observations.md");
    expect(result).toContain("### preferences/interests.md");
  });

  it("should return empty string when no memory files exist", async () => {
    const retriever = new MemoryRetriever(store);
    const result = await retriever.retrieve();
    expect(result).toBe("");
  });

  it("should respect maxTokens limit (approximate)", async () => {
    const bigContent = "## 2026-02-21\n" + "- Observation line\n".repeat(5000);
    await store.write("observations.md", bigContent);
    await store.write("identity.md", "identity content\n");

    const retriever = new MemoryRetriever(store, { maxTokens: 500 });
    const result = await retriever.retrieve();

    expect(result.length).toBeLessThan(bigContent.length);
    expect(result).toContain("identity content");
  });
});
