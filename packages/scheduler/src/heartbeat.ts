import type { LLMClient, Message, MemoryStore } from "@augure/types";

const HEARTBEAT_PROMPT = `You are a monitoring agent. Your job is to review the user's memory and decide if any proactive action is needed right now.

Review the memory context below and determine:
1. Are there any time-sensitive tasks or reminders?
2. Should the user be notified about something?
3. Are there any scheduled checks that need to run?

If action is needed, respond with:
ACTION: <description of what to do>

If no action is needed, respond with:
ACTION: none

Be concise. Only suggest actions that are clearly needed based on the memory context.`;

export interface HeartbeatConfig {
  llm: LLMClient;
  memory: MemoryStore;
  intervalMs: number;
  onAction: (action: string) => void | Promise<void>;
}

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly config: HeartbeatConfig) {}

  async tick(): Promise<void> {
    const memoryContent = await this.loadMemory();

    const messages: Message[] = [
      { role: "system", content: HEARTBEAT_PROMPT },
      {
        role: "user",
        content: `Current time: ${new Date().toISOString()}\n\n## Memory\n${memoryContent}`,
      },
    ];

    const response = await this.config.llm.chat(messages);
    const action = this.parseAction(response.content);

    if (action && action.toLowerCase() !== "none") {
      await this.config.onAction(action);
    }
  }

  start(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        console.error("[augure] Heartbeat error:", err),
      );
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private parseAction(content: string): string | undefined {
    const match = content.match(/ACTION:\s*(.+)/i);
    return match?.[1]?.trim();
  }

  private async loadMemory(): Promise<string> {
    try {
      const exists = await this.config.memory.exists("observations.md");
      if (exists) {
        return this.config.memory.read("observations.md");
      }
    } catch {
      // Memory not available
    }
    return "(no memory available)";
  }
}
