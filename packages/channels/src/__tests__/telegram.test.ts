import { describe, it, expect } from "vitest";
import { TelegramChannel } from "../telegram.js";

const FAKE_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

describe("TelegramChannel", () => {
  it("should have correct channel type", () => {
    const channel = new TelegramChannel({
      botToken: FAKE_TOKEN,
      allowedUsers: [],
    });

    expect(channel.type).toBe("telegram");
  });

  it("should register message handlers without error", () => {
    const channel = new TelegramChannel({
      botToken: FAKE_TOKEN,
      allowedUsers: [],
    });

    expect(() => {
      channel.onMessage(async () => {});
    }).not.toThrow();
  });

  it("should reject messages from unauthorized users", () => {
    const channel = new TelegramChannel({
      botToken: FAKE_TOKEN,
      allowedUsers: [111, 222, 333],
    });

    expect(channel.isUserAllowed(111)).toBe(true);
    expect(channel.isUserAllowed(222)).toBe(true);
    expect(channel.isUserAllowed(999)).toBe(false);
  });
});
