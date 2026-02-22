export interface ParsedSkillResponse {
  skillMd: string;
  skillTs: string;
  skillTestTs: string;
}

/**
 * Parse an LLM response containing skill generation output.
 * Looks for three fenced code blocks: skill.md, skill.ts, skill.test.ts.
 * Supports named fences (```yaml filename=skill.md) and section headers (## skill.md).
 */
export function parseSkillResponse(content: string): ParsedSkillResponse | null {
  // Strategy 1: Named fences with filename
  const namedResult = parseNamedFences(content);
  if (namedResult) return namedResult;

  // Strategy 2: Section headers followed by code blocks
  const sectionResult = parseSectionHeaders(content);
  if (sectionResult) return sectionResult;

  // Strategy 3: Three consecutive code blocks in order (md, ts, test.ts)
  const sequentialResult = parseSequentialBlocks(content);
  if (sequentialResult) return sequentialResult;

  return null;
}

function parseNamedFences(content: string): ParsedSkillResponse | null {
  const fencePattern = /```\w*\s+(?:filename=)?(\S+)\s*\n([\s\S]*?)```/g;
  const blocks = new Map<string, string>();

  let match;
  while ((match = fencePattern.exec(content)) !== null) {
    blocks.set(match[1], match[2].trim());
  }

  const skillMd = blocks.get("skill.md");
  const skillTs = blocks.get("skill.ts");
  const skillTestTs = blocks.get("skill.test.ts");

  if (skillMd && skillTs && skillTestTs) {
    return { skillMd, skillTs, skillTestTs };
  }
  return null;
}

function parseSectionHeaders(content: string): ParsedSkillResponse | null {
  const sections = new Map<string, string>();
  // Match "## skill.md" or "### skill.md" followed by a code block
  const sectionPattern = /#{2,3}\s+(skill\.(?:md|ts|test\.ts))\s*\n+```\w*\n([\s\S]*?)```/g;

  let match;
  while ((match = sectionPattern.exec(content)) !== null) {
    sections.set(match[1], match[2].trim());
  }

  const skillMd = sections.get("skill.md");
  const skillTs = sections.get("skill.ts");
  const skillTestTs = sections.get("skill.test.ts");

  if (skillMd && skillTs && skillTestTs) {
    return { skillMd, skillTs, skillTestTs };
  }
  return null;
}

function parseSequentialBlocks(content: string): ParsedSkillResponse | null {
  const blockPattern = /```\w*\n([\s\S]*?)```/g;
  const blocks: string[] = [];

  let match;
  while ((match = blockPattern.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }

  if (blocks.length >= 3) {
    // First YAML/markdown block is skill.md, next two are TypeScript
    return {
      skillMd: blocks[0],
      skillTs: blocks[1],
      skillTestTs: blocks[2],
    };
  }
  return null;
}
