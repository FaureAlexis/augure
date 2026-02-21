import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../config.js";

const validConfig = {
  identity: { name: "augure", personality: "helpful assistant" },
  llm: {
    default: {
      provider: "openrouter",
      apiKey: "sk-test-key",
      model: "anthropic/claude-3.5-sonnet",
      maxTokens: 4096,
    },
  },
  channels: {
    web: { enabled: true, port: 3000 },
  },
  memory: {
    path: "./data/memory",
    autoIngest: true,
    maxRetrievalTokens: 8000,
  },
  scheduler: {
    heartbeatInterval: "30s",
    jobs: [],
  },
  sandbox: {
    runtime: "docker",
    defaults: { timeout: 30000, memoryLimit: "512m", cpuLimit: "1.0" },
  },
  tools: {},
  security: {
    sandboxOnly: true,
    allowedHosts: ["localhost"],
    maxConcurrentSandboxes: 5,
  },
};

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "augure-config-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("should load a valid JSON5 config file", async () => {
    const configPath = join(tmpDir, "config.json5");
    const json5Content = `{
      // This is a JSON5 comment
      identity: { name: "augure", personality: "helpful assistant" },
      llm: {
        default: {
          provider: "openrouter",
          apiKey: "sk-test-key",
          model: "anthropic/claude-3.5-sonnet",
          maxTokens: 4096,
        },
      },
      channels: {
        web: { enabled: true, port: 3000 },
      },
      memory: {
        path: "./data/memory",
        autoIngest: true,
        maxRetrievalTokens: 8000,
      },
      scheduler: {
        heartbeatInterval: "30s",
        jobs: [],
      },
      sandbox: {
        runtime: "docker",
        defaults: { timeout: 30000, memoryLimit: "512m", cpuLimit: "1.0" },
      },
      tools: {},
      security: {
        sandboxOnly: true,
        allowedHosts: ["localhost"],
        maxConcurrentSandboxes: 5,
      },
    }`;

    await writeFile(configPath, json5Content);
    const config = await loadConfig(configPath);

    expect(config.identity.name).toBe("augure");
    expect(config.llm.default.provider).toBe("openrouter");
    expect(config.channels.web?.port).toBe(3000);
  });

  it("should interpolate environment variables", async () => {
    process.env["AUGURE_TEST_API_KEY"] = "sk-from-env";

    const configPath = join(tmpDir, "config.json5");
    const content = JSON.stringify({
      ...validConfig,
      llm: {
        default: {
          ...validConfig.llm.default,
          apiKey: "${AUGURE_TEST_API_KEY}",
        },
      },
    });

    await writeFile(configPath, content);
    const config = await loadConfig(configPath);

    expect(config.llm.default.apiKey).toBe("sk-from-env");

    delete process.env["AUGURE_TEST_API_KEY"];
  });

  it("should throw on missing required fields", async () => {
    const configPath = join(tmpDir, "config.json5");
    await writeFile(configPath, JSON.stringify({ identity: { name: "x" } }));

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("should throw on missing config file", async () => {
    await expect(loadConfig(join(tmpDir, "nope.json5"))).rejects.toThrow();
  });
});
