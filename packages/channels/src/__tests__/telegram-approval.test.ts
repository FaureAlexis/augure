import { describe, it, expect } from "vitest";
import { TelegramChannel } from "../telegram/telegram.js";

const FAKE_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

describe("TelegramChannel approval", () => {
  it("should have sendApprovalRequest method", () => {
    const channel = new TelegramChannel({
      botToken: FAKE_TOKEN,
      allowedUsers: [],
    });

    expect(typeof channel.sendApprovalRequest).toBe("function");
  });

  it("should have onApprovalResponse method", () => {
    const channel = new TelegramChannel({
      botToken: FAKE_TOKEN,
      allowedUsers: [],
    });

    expect(typeof channel.onApprovalResponse).toBe("function");
  });

  it("should register approval response handlers without error", () => {
    const channel = new TelegramChannel({
      botToken: FAKE_TOKEN,
      allowedUsers: [],
    });

    expect(() => {
      channel.onApprovalResponse(() => {});
    }).not.toThrow();
  });
});
