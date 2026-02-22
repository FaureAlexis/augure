import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonaResolver } from "../persona.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "persona-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("PersonaResolver", () => {
  it("loadAll() loads .md files and parses frontmatter", async () => {
    await writeFile(
      join(dir, "default.md"),
      `---
id: default
name: Default
priority: 0
---
You are a helpful assistant.`,
    );
    await writeFile(
      join(dir, "coder.md"),
      `---
id: coder
name: Coder
triggers:
  keywords: [code, typescript, bug]
priority: 10
---
You are a senior engineer.`,
    );

    const resolver = new PersonaResolver(dir);
    await resolver.loadAll();

    const result = resolver.resolve("help me with some code");
    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain("You are a senior engineer.");
  });

  it("resolve() returns default body when no keyword match", async () => {
    await writeFile(
      join(dir, "default.md"),
      `---
id: default
name: Default
priority: 0
---
You are a helpful assistant.`,
    );
    await writeFile(
      join(dir, "coder.md"),
      `---
id: coder
name: Coder
triggers:
  keywords: [code, typescript, bug]
priority: 10
---
You are a senior engineer.`,
    );

    const resolver = new PersonaResolver(dir);
    await resolver.loadAll();

    const result = resolver.resolve("hello");
    expect(result).toBe("You are a helpful assistant.");
    expect(result).not.toContain("senior engineer");
  });

  it("resolve() detects keywords and returns matching persona", async () => {
    await writeFile(
      join(dir, "coder.md"),
      `---
id: coder
name: Coder
triggers:
  keywords: [code, typescript, bug]
priority: 10
---
You are a senior engineer.`,
    );

    const resolver = new PersonaResolver(dir);
    await resolver.loadAll();

    const result = resolver.resolve("fix this typescript bug");
    expect(result).toContain("You are a senior engineer.");
  });

  it("resolve() stacks default + matched persona", async () => {
    await writeFile(
      join(dir, "default.md"),
      `---
id: default
name: Default
priority: 0
---
You are a helpful assistant.`,
    );
    await writeFile(
      join(dir, "coder.md"),
      `---
id: coder
name: Coder
triggers:
  keywords: [code, typescript, bug]
priority: 10
---
You are a senior engineer.`,
    );

    const resolver = new PersonaResolver(dir);
    await resolver.loadAll();

    const result = resolver.resolve("review this code please");
    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain("You are a senior engineer.");

    // Verify stacking order: default first, then matched
    const defaultIdx = result.indexOf("You are a helpful assistant.");
    const coderIdx = result.indexOf("You are a senior engineer.");
    expect(defaultIdx).toBeLessThan(coderIdx);
  });

  it("resolve() uses priority to break ties", async () => {
    await writeFile(
      join(dir, "low.md"),
      `---
id: low
name: Low Priority
triggers:
  keywords: [data]
priority: 1
---
Low priority persona.`,
    );
    await writeFile(
      join(dir, "high.md"),
      `---
id: high
name: High Priority
triggers:
  keywords: [data]
priority: 10
---
High priority persona.`,
    );

    const resolver = new PersonaResolver(dir);
    await resolver.loadAll();

    const result = resolver.resolve("show me the data");
    expect(result).toContain("High priority persona.");
    expect(result).not.toContain("Low priority persona.");
  });

  it("loadAll() handles missing directory gracefully", async () => {
    const resolver = new PersonaResolver(join(dir, "nonexistent"));
    await resolver.loadAll();

    const result = resolver.resolve("hello");
    expect(result).toBe("");
  });

  it("resolve() matches skill patterns with glob", async () => {
    await writeFile(
      join(dir, "coder.md"),
      `---
id: coder
name: Coder
triggers:
  skills: [github-*]
priority: 10
---
You are a senior engineer.`,
    );

    const resolver = new PersonaResolver(dir);
    await resolver.loadAll();

    const result = resolver.resolve("hello", "github-pr-review");
    expect(result).toContain("You are a senior engineer.");
  });
});
