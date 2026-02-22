import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkillHub } from "../hub.js";

const MANIFEST = {
  version: 1,
  skills: [
    { id: "example-skill", name: "Example", description: "An example skill" },
  ],
};

const SKILL_MD = `---
id: example-skill
name: Example
version: 1
status: active
trigger:
  type: manual
sandbox: true
tools: []
tags: []
---

# Example Skill

Does something useful.
`;

const SKILL_TS = `export default async function(ctx) { return { output: "ok" }; }`;
const SKILL_TEST_TS = `import { describe, it } from "node:test"; describe("test", () => { it("works", () => {}); });`;

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(responses: Record<string, { ok: boolean; body?: unknown; status?: number }>) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        if (!response.ok) {
          return { ok: false, status: response.status ?? 404, statusText: "Not Found" };
        }
        return {
          ok: true,
          status: 200,
          json: async () => response.body,
          text: async () => (typeof response.body === "string" ? response.body : JSON.stringify(response.body)),
        };
      }
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  });
}

describe("SkillHub", () => {
  it("should list skills from manifest", async () => {
    mockFetch({ "manifest.json": { ok: true, body: MANIFEST } });
    const hub = new SkillHub({ repo: "test/skills", branch: "main" });

    const skills = await hub.list();

    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("example-skill");
  });

  it("should download a complete skill", async () => {
    mockFetch({
      "skill.md": { ok: true, body: SKILL_MD },
      "skill.ts": { ok: true, body: SKILL_TS },
      "skill.test.ts": { ok: true, body: SKILL_TEST_TS },
    });
    const hub = new SkillHub({ repo: "test/skills", branch: "main" });

    const skill = await hub.download("example-skill");

    expect(skill.meta.id).toBe("example-skill");
    expect(skill.body).toContain("Example Skill");
    expect(skill.code).toContain("export default");
    expect(skill.testCode).toContain("node:test");
  });

  it("should handle missing skill.ts gracefully", async () => {
    mockFetch({
      "skill.md": { ok: true, body: SKILL_MD },
      "skill.ts": { ok: false, status: 404 },
      "skill.test.ts": { ok: false, status: 404 },
    });
    const hub = new SkillHub({ repo: "test/skills", branch: "main" });

    const skill = await hub.download("example-skill");

    expect(skill.meta.id).toBe("example-skill");
    expect(skill.code).toBeUndefined();
    expect(skill.testCode).toBeUndefined();
  });

  it("should throw when manifest fetch fails", async () => {
    mockFetch({ "manifest.json": { ok: false, status: 500 } });
    const hub = new SkillHub({ repo: "test/skills", branch: "main" });

    await expect(hub.list()).rejects.toThrow("Failed to fetch hub manifest");
  });

  it("should throw when skill.md not found", async () => {
    mockFetch({ "skill.md": { ok: false, status: 404 } });
    const hub = new SkillHub({ repo: "test/skills", branch: "main" });

    await expect(hub.download("nonexistent")).rejects.toThrow("Failed to fetch");
  });

  it("should use correct base URL", async () => {
    mockFetch({ "manifest.json": { ok: true, body: MANIFEST } });
    const hub = new SkillHub({ repo: "FaureAlexis/augure-skills", branch: "main" });

    await hub.list();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/FaureAlexis/augure-skills/main/manifest.json",
    );
  });
});
