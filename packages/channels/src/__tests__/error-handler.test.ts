import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../middleware/error-handler.js";

describe("withRetry", () => {
  it("should succeed on first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("should retry on failure and succeed", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10 }),
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("should not retry non-retryable errors (4xx)", async () => {
    const error = Object.assign(new Error("bad request"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }),
    ).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("should retry on 429 rate limit", async () => {
    const error429 = Object.assign(new Error("rate limited"), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
