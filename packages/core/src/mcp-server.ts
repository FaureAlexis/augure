import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolRegistry } from "@augure/tools";
import type { MemoryStore, Logger } from "@augure/types";
import type { PersonaResolver } from "./persona.js";

function validateMemoryPath(path: string): void {
  if (path.includes("..") || path.startsWith("/")) {
    throw new Error(`Invalid memory path: ${path}`);
  }
}

export interface McpSchedulerAdapter {
  listJobs(): { id: string; cron?: string; runAt?: string; prompt: string; channel: string; enabled: boolean; lastRun?: string }[];
}

export interface McpServerConfig {
  tools: ToolRegistry;
  memory: MemoryStore;
  scheduler: McpSchedulerAdapter;
  personaResolver?: PersonaResolver;
  logger?: Logger;
  version?: string;
}

export function createMcpServer(config: McpServerConfig): Server {
  const server = new Server(
    { name: "augure", version: config.version ?? "0.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  // --- Tool bridge ---
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: config.tools.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters as { type: "object"; properties: Record<string, unknown> },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await config.tools.execute(
      req.params.name,
      req.params.arguments ?? {},
    );
    return {
      content: [{ type: "text" as const, text: result.output }],
      isError: !result.success,
    };
  });

  // --- Resources: memory files + jobs ---
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const memFiles = await config.memory.list();
    const jobs = config.scheduler.listJobs();
    return {
      resources: [
        ...memFiles.map((f) => ({
          uri: `memory://${f}`,
          name: f,
          mimeType: "text/markdown" as const,
        })),
        {
          uri: "jobs://list",
          name: "Scheduled Jobs",
          mimeType: "application/json" as const,
        },
        ...jobs.map((j) => ({
          uri: `jobs://${j.id}`,
          name: `Job: ${j.id}`,
          mimeType: "application/json" as const,
        })),
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;

    if (uri.startsWith("memory://")) {
      const path = uri.slice("memory://".length);
      validateMemoryPath(path);
      let content: string;
      try {
        content = await config.memory.read(path);
      } catch {
        throw new Error(`Memory file not found: ${path}`);
      }
      return {
        contents: [{ uri, text: content, mimeType: "text/markdown" as const }],
      };
    }

    if (uri === "jobs://list") {
      return {
        contents: [{
          uri,
          text: JSON.stringify(config.scheduler.listJobs(), null, 2),
          mimeType: "application/json" as const,
        }],
      };
    }

    if (uri.startsWith("jobs://")) {
      const jobId = uri.slice("jobs://".length);
      const job = config.scheduler.listJobs().find((j) => j.id === jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }
      return {
        contents: [{
          uri,
          text: JSON.stringify(job, null, 2),
          mimeType: "application/json" as const,
        }],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  // --- Prompts: personas ---
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    if (!config.personaResolver) return { prompts: [] };
    const personas = config.personaResolver.listAll();
    return {
      prompts: personas.map((p) => ({
        name: p.meta.id,
        description: `Persona: ${p.meta.name}`,
        arguments: [
          { name: "message", description: "User message for context", required: false },
        ],
      })),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (!config.personaResolver) throw new Error("No personas configured");
    const message = req.params.arguments?.message ?? "";
    const personaText = config.personaResolver.resolve(String(message));
    return {
      messages: [
        { role: "user" as const, content: { type: "text" as const, text: personaText } },
      ],
    };
  });

  return server;
}
