import { describe, it, expect, vi } from "vitest";
import { ApprovalGate } from "../approval.js";
import type { Channel, ApprovalResponse, InlineButton } from "@augure/types";

function mockChannel() {
  const approvalHandlers: ((response: ApprovalResponse) => void)[] = [];

  const sendApprovalRequest = vi.fn(
    async (_userId: string, _text: string, _buttons: InlineButton[], _requestId: string): Promise<void> => {},
  );

  const channel: Channel & { _triggerApproval: (r: ApprovalResponse) => void } = {
    type: "telegram" as const,
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    onMessage: vi.fn(),
    sendApprovalRequest,
    onApprovalResponse: (handler: (response: ApprovalResponse) => void) => {
      approvalHandlers.push(handler);
    },
    _triggerApproval: (response: ApprovalResponse) => {
      for (const handler of approvalHandlers) {
        handler(response);
      }
    },
  };

  return { channel, sendApprovalRequest };
}

describe("ApprovalGate", () => {
  it("should return true when user approves", async () => {
    const { channel, sendApprovalRequest } = mockChannel();
    const gate = new ApprovalGate({ channel, timeoutMs: 5000 });

    const promise = gate.request("123", "sandbox_exec", { command: "ls" });

    expect(sendApprovalRequest).toHaveBeenCalledOnce();
    const [, , buttons] = sendApprovalRequest.mock.calls[0]!;
    const approveData = buttons[0]!.callbackData;
    const requestId = approveData.replace("approve:", "");

    channel._triggerApproval({ requestId, approved: true, userId: "123" });

    const result = await promise;
    expect(result).toBe(true);
  });

  it("should return false when user rejects", async () => {
    const { channel, sendApprovalRequest } = mockChannel();
    const gate = new ApprovalGate({ channel, timeoutMs: 5000 });

    const promise = gate.request("123", "sandbox_exec", { command: "rm -rf /" });

    const [, , buttons] = sendApprovalRequest.mock.calls[0]!;
    const rejectData = buttons[1]!.callbackData;
    const requestId = rejectData.replace("reject:", "");

    channel._triggerApproval({ requestId, approved: false, userId: "123" });

    const result = await promise;
    expect(result).toBe(false);
  });

  it("should auto-reject on timeout", async () => {
    const { channel } = mockChannel();
    const gate = new ApprovalGate({ channel, timeoutMs: 50 });

    const result = await gate.request("123", "sandbox_exec", { command: "ls" });

    expect(result).toBe(false);
  });

  it("should auto-approve when channel does not support approval", async () => {
    const channel: Channel = {
      type: "system" as const,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(async () => {}),
      onMessage: vi.fn(),
    };

    const gate = new ApprovalGate({ channel, timeoutMs: 5000 });
    const result = await gate.request("123", "sandbox_exec", { command: "ls" });

    expect(result).toBe(true);
  });

  it("should include tool name and args in approval message", async () => {
    const { channel, sendApprovalRequest } = mockChannel();
    const gate = new ApprovalGate({ channel, timeoutMs: 5000 });

    const promise = gate.request("user1", "opencode", { task: "build something" });

    expect(sendApprovalRequest).toHaveBeenCalledWith(
      "user1",
      expect.stringContaining("opencode"),
      expect.any(Array),
      expect.any(String),
    );
    expect(sendApprovalRequest).toHaveBeenCalledWith(
      "user1",
      expect.stringContaining("build something"),
      expect.any(Array),
      expect.any(String),
    );

    // Clean up by triggering approval
    const [, , buttons] = sendApprovalRequest.mock.calls[0]!;
    const requestId = buttons[0]!.callbackData.replace("approve:", "");
    channel._triggerApproval({ requestId, approved: true, userId: "user1" });
    await promise;
  });
});
