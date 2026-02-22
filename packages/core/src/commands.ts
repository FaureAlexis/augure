import type { SkillStatus } from "@augure/types";

export type AgentState = "running" | "paused" | "killed";

export interface CommandContext {
  scheduler: { start(): void; stop(): void };
  pool: { destroyAll(): Promise<void> };
  agent: { getState(): AgentState; setState(s: AgentState): void };
  skillManager?: { updateStatus(id: string, status: SkillStatus): Promise<void> };
}

export interface CommandResult {
  handled: boolean;
  response?: string;
}

export async function handleCommand(
  text: string,
  ctx: CommandContext,
): Promise<CommandResult> {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return { handled: false };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const arg = parts[1];

  switch (command) {
    case "pause": {
      if (arg) {
        if (!ctx.skillManager) {
          return { handled: true, response: "Skills system is not configured." };
        }
        await ctx.skillManager.updateStatus(arg, "paused");
        return { handled: true, response: `Skill "${arg}" paused.` };
      }
      ctx.scheduler.stop();
      ctx.agent.setState("paused");
      return { handled: true, response: "Agent paused. Scheduler stopped. Direct messages still accepted." };
    }
    case "resume": {
      ctx.scheduler.start();
      ctx.agent.setState("running");
      return { handled: true, response: "Agent resumed. Scheduler restarted." };
    }
    case "kill": {
      ctx.scheduler.stop();
      await ctx.pool.destroyAll();
      ctx.agent.setState("killed");
      return { handled: true, response: "Emergency stop. All containers destroyed. Agent in read-only mode." };
    }
    case "status": {
      const state = ctx.agent.getState();
      return { handled: true, response: `Agent state: ${state}` };
    }
    default:
      return { handled: false };
  }
}
