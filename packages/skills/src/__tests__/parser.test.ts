import { describe, it, expect } from "vitest";
import { parseSkillMd, serializeSkillMd, validateSkillMeta } from "../parser.js";

const VALID_SKILL_MD = `---
id: test-skill
name: Test Skill
version: 2
created: "2026-02-20T00:00:00Z"
updated: "2026-02-21T00:00:00Z"
status: active
trigger:
  type: cron
  schedule: "0 8 * * *"
  channel: telegram
sandbox: true
tools:
  - memory_read
  - http
tags:
  - test
  - monitoring
---

# Test Skill

This is the body of the skill.
`;

describe("parseSkillMd", () => {
  it("should parse valid skill.md with all fields", () => {
    const { meta, body } = parseSkillMd(VALID_SKILL_MD);
    expect(meta.id).toBe("test-skill");
    expect(meta.name).toBe("Test Skill");
    expect(meta.version).toBe(2);
    expect(meta.status).toBe("active");
    expect(meta.trigger.type).toBe("cron");
    expect(meta.trigger.schedule).toBe("0 8 * * *");
    expect(meta.trigger.channel).toBe("telegram");
    expect(meta.sandbox).toBe(true);
    expect(meta.tools).toEqual(["memory_read", "http"]);
    expect(meta.tags).toEqual(["test", "monitoring"]);
    expect(body).toContain("# Test Skill");
  });

  it("should apply defaults for optional fields", () => {
    const minimal = `---
id: minimal-skill
name: Minimal
trigger:
  type: manual
---

Body.
`;
    const { meta } = parseSkillMd(minimal);
    expect(meta.version).toBe(1);
    expect(meta.status).toBe("draft");
    expect(meta.sandbox).toBe(true);
    expect(meta.tools).toEqual([]);
    expect(meta.tags).toEqual([]);
  });

  it("should trim the body content", () => {
    const { body } = parseSkillMd(VALID_SKILL_MD);
    expect(body).not.toMatch(/^\s/);
    expect(body).not.toMatch(/\s$/);
  });
});

describe("serializeSkillMd", () => {
  it("should roundtrip parse and serialize", () => {
    const { meta, body } = parseSkillMd(VALID_SKILL_MD);
    const serialized = serializeSkillMd(meta, body);
    const { meta: meta2, body: body2 } = parseSkillMd(serialized);
    expect(meta2.id).toBe(meta.id);
    expect(meta2.name).toBe(meta.name);
    expect(meta2.version).toBe(meta.version);
    expect(meta2.status).toBe(meta.status);
    expect(body2).toBe(body);
  });
});

describe("validateSkillMeta", () => {
  it("should reject missing id", () => {
    expect(() => validateSkillMeta({ name: "Test", trigger: { type: "manual" } }))
      .toThrow("missing or invalid 'id'");
  });

  it("should reject invalid id format", () => {
    expect(() => validateSkillMeta({ id: "Bad ID", name: "Test", trigger: { type: "manual" } }))
      .toThrow("invalid id format");
  });

  it("should reject missing name", () => {
    expect(() => validateSkillMeta({ id: "test", trigger: { type: "manual" } }))
      .toThrow("missing or invalid 'name'");
  });

  it("should reject missing trigger", () => {
    expect(() => validateSkillMeta({ id: "test", name: "Test" }))
      .toThrow("missing 'trigger'");
  });

  it("should reject invalid trigger type", () => {
    expect(() => validateSkillMeta({ id: "test", name: "Test", trigger: { type: "invalid" } }))
      .toThrow("invalid trigger.type");
  });

  it("should reject cron trigger without schedule", () => {
    expect(() => validateSkillMeta({ id: "test", name: "Test", trigger: { type: "cron" } }))
      .toThrow("cron trigger requires 'schedule'");
  });

  it("should reject invalid status", () => {
    expect(() => validateSkillMeta({ id: "test", name: "Test", trigger: { type: "manual" }, status: "invalid" }))
      .toThrow("invalid status");
  });

  it("should reject invalid version", () => {
    expect(() => validateSkillMeta({ id: "test", name: "Test", trigger: { type: "manual" }, version: -1 }))
      .toThrow("positive integer");
  });
});
