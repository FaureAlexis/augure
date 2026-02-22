import { describe, it, expect, vi } from "vitest";
import { createOutgoingPipeline } from "../pipeline.js";
import type { OutgoingMiddleware } from "../types.js";
import type { OutgoingMessage } from "@augure/types";

describe("createOutgoingPipeline", () => {
  it("should call middlewares in order then the send function", async () => {
    const order: string[] = [];

    const mw1: OutgoingMiddleware = async (msg, next) => {
      order.push("mw1-before");
      await next();
      order.push("mw1-after");
    };

    const mw2: OutgoingMiddleware = async (msg, next) => {
      order.push("mw2-before");
      await next();
      order.push("mw2-after");
    };

    const send = vi.fn().mockImplementation(async () => {
      order.push("send");
    });

    const pipeline = createOutgoingPipeline([mw1, mw2], send);
    const msg: OutgoingMessage = {
      channelType: "telegram",
      userId: "123",
      text: "hello",
    };

    await pipeline(msg);

    expect(order).toEqual(["mw1-before", "mw2-before", "send", "mw2-after", "mw1-after"]);
    expect(send).toHaveBeenCalledWith(msg);
  });

  it("should work with no middlewares", async () => {
    const send = vi.fn();
    const pipeline = createOutgoingPipeline([], send);
    const msg: OutgoingMessage = {
      channelType: "telegram",
      userId: "123",
      text: "hello",
    };

    await pipeline(msg);
    expect(send).toHaveBeenCalledWith(msg);
  });

  it("should allow middleware to modify the message", async () => {
    const uppercaseMw: OutgoingMiddleware = async (msg, next) => {
      msg.text = msg.text.toUpperCase();
      await next();
    };

    const send = vi.fn();
    const pipeline = createOutgoingPipeline([uppercaseMw], send);
    const msg: OutgoingMessage = {
      channelType: "telegram",
      userId: "123",
      text: "hello",
    };

    await pipeline(msg);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: "HELLO" }));
  });
});
