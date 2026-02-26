import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMcpServer } from "../mcp-server.js";
import type { McpServerConfig } from "../mcp-server.js";
import type { ToolRegistry } from "@augure/tools";
import type { MemoryStore } from "@augure/types";

function makeMockTools(): ToolRegistry {
  const tools = [
    {
      name: "test_tool",
      description: "A test tool",
      parameters: { type: "object", properties: { input: { type: "string" } } },
      execute: vi.fn().mockResolvedValue({ success: true, output: "test output" }),
    },
  ];
  return {
    list: () => tools,
    execute: vi.fn().mockResolvedValue({ success: true, output: "executed" }),
  } as unknown as ToolRegistry;
}

function makeMockMemory(): MemoryStore {
  return {
    list: vi.fn().mockResolvedValue(["notes.md", "tasks/todo.md"]),
    read: vi.fn().mockResolvedValue("# Notes\nSome content"),
    write: vi.fn(),
    append: vi.fn(),
    exists: vi.fn(),
  };
}

function makeMockScheduler() {
  return {
    listJobs: vi.fn().mockReturnValue([
      { id: "morning-check", cron: "0 8 * * *", prompt: "Check news", channel: "telegram", enabled: true },
    ]),
  };
}

function makeMockPersonaResolver() {
  return {
    listAll: vi.fn().mockReturnValue([
      { meta: { id: "default", name: "Default" }, body: "You are helpful." },
      { meta: { id: "coder", name: "Coder" }, body: "You write code." },
    ]),
    resolve: vi.fn().mockReturnValue("You are helpful.\n\nYou write code."),
    loadAll: vi.fn(),
  };
}

describe("createMcpServer", () => {
  let serverConfig: McpServerConfig;

  beforeEach(() => {
    serverConfig = {
      tools: makeMockTools(),
      memory: makeMockMemory(),
      scheduler: makeMockScheduler(),
      personaResolver: makeMockPersonaResolver() as unknown as McpServerConfig["personaResolver"],
    };
  });

  it("should create a server instance", () => {
    const server = createMcpServer(serverConfig);
    expect(server).toBeDefined();
  });

  // Test the handler registrations by invoking the server's internal handlers
  // Since the MCP SDK Server class doesn't expose handlers directly,
  // we test that createMcpServer doesn't throw and returns a valid Server.
  it("should register handlers without throwing", () => {
    expect(() => createMcpServer(serverConfig)).not.toThrow();
  });

  it("should work without persona resolver", () => {
    const config = { ...serverConfig, personaResolver: undefined };
    expect(() => createMcpServer(config)).not.toThrow();
  });
});
