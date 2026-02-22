import { describe, it, expect } from "vitest";
import { parseSkillResponse } from "../llm-parser.js";

describe("parseSkillResponse", () => {
  it("should parse named fences with filename=", () => {
    const content = `Here is the skill:

\`\`\`yaml filename=skill.md
---
id: test
name: Test
---
Body
\`\`\`

\`\`\`typescript filename=skill.ts
export default async function execute(ctx) {
  return { output: "ok" };
}
\`\`\`

\`\`\`typescript filename=skill.test.ts
import { test } from "node:test";
test("works", () => {});
\`\`\`
`;
    const result = parseSkillResponse(content);
    expect(result).not.toBeNull();
    expect(result!.skillMd).toContain("id: test");
    expect(result!.skillTs).toContain("export default");
    expect(result!.skillTestTs).toContain("node:test");
  });

  it("should parse section headers", () => {
    const content = `## skill.md

\`\`\`yaml
---
id: test
---
Body
\`\`\`

## skill.ts

\`\`\`typescript
const x = 1;
\`\`\`

## skill.test.ts

\`\`\`typescript
const t = 1;
\`\`\`
`;
    const result = parseSkillResponse(content);
    expect(result).not.toBeNull();
    expect(result!.skillMd).toContain("id: test");
    expect(result!.skillTs).toContain("const x");
    expect(result!.skillTestTs).toContain("const t");
  });

  it("should parse three sequential blocks as fallback", () => {
    const content = `
\`\`\`yaml
---
id: test
---
Body
\`\`\`

\`\`\`typescript
export default function() {}
\`\`\`

\`\`\`typescript
test("it works", () => {});
\`\`\`
`;
    const result = parseSkillResponse(content);
    expect(result).not.toBeNull();
    expect(result!.skillMd).toContain("id: test");
    expect(result!.skillTs).toContain("export default");
    expect(result!.skillTestTs).toContain("test(");
  });

  it("should return null for content with fewer than 3 blocks", () => {
    const content = `
\`\`\`yaml
---
id: test
---
\`\`\`

\`\`\`typescript
const x = 1;
\`\`\`
`;
    expect(parseSkillResponse(content)).toBeNull();
  });

  it("should return null for empty content", () => {
    expect(parseSkillResponse("")).toBeNull();
  });

  it("should return null for content with no code blocks", () => {
    expect(parseSkillResponse("Just some text without any code blocks.")).toBeNull();
  });

  it("should handle extra whitespace in blocks", () => {
    const content = `\`\`\`yaml filename=skill.md

  ---
  id: test
  ---

\`\`\`

\`\`\`typescript filename=skill.ts

  code here

\`\`\`

\`\`\`typescript filename=skill.test.ts

  test here

\`\`\``;
    const result = parseSkillResponse(content);
    expect(result).not.toBeNull();
    expect(result!.skillMd).toContain("id: test");
  });
});
