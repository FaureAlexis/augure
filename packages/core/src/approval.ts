import type { Channel, Logger } from "@augure/types";
import { noopLogger } from "@augure/types";
import { randomUUID } from "node:crypto";

export interface ApprovalGateConfig {
  channel: Channel;
  timeoutMs?: number;
  logger?: Logger;
}

export class ApprovalGate {
  private pending = new Map<string, { resolve: (approved: boolean) => void }>();
  private readonly channel: Channel;
  private readonly timeoutMs: number;
  private readonly log: Logger;

  constructor(config: ApprovalGateConfig) {
    this.channel = config.channel;
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.log = config.logger ?? noopLogger;

    if (this.channel.onApprovalResponse) {
      this.channel.onApprovalResponse((response) => {
        const entry = this.pending.get(response.requestId);
        if (entry) {
          this.pending.delete(response.requestId);
          entry.resolve(response.approved);
        }
      });
    }
  }

  async request(userId: string, toolName: string, args: unknown): Promise<boolean> {
    if (!this.channel.sendApprovalRequest) {
      this.log.warn(`Channel does not support approval requests — auto-approving ${toolName}`);
      return true;
    }

    const requestId = randomUUID();
    const argsStr = JSON.stringify(args, null, 2);
    const text = `Tool "${toolName}" requires approval.\n\nArguments:\n${argsStr}`;

    const buttons = [
      { label: "Approve", callbackData: `approve:${requestId}` },
      { label: "Reject", callbackData: `reject:${requestId}` },
    ];

    // Set up the pending entry BEFORE sending the request so the
    // approval handler can resolve it even if the response arrives immediately.
    const resultPromise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.log.warn(`Approval timed out for ${toolName} (request ${requestId})`);
        resolve(false);
      }, this.timeoutMs);

      this.pending.set(requestId, {
        resolve: (approved) => {
          clearTimeout(timer);
          resolve(approved);
        },
      });
    });

    await this.channel.sendApprovalRequest(userId, text, buttons, requestId);

    return resultPromise;
  }
}
