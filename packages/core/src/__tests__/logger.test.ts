import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../logger.js";

describe("createLogger", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  beforeEach(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });

  it("should log info messages at info level", () => {
    const log = createLogger({ level: "info" });
    log.info("hello");
    expect(console.log).toHaveBeenCalledOnce();
  });

  it("should not log debug messages at info level", () => {
    const log = createLogger({ level: "info" });
    log.debug("hello");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("should log debug messages at debug level", () => {
    const log = createLogger({ level: "debug" });
    log.debug("hello");
    expect(console.log).toHaveBeenCalledOnce();
  });

  it("should use console.warn for warn level", () => {
    const log = createLogger({ level: "info" });
    log.warn("warning");
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("should use console.error for error level", () => {
    const log = createLogger({ level: "info" });
    log.error("failure");
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("should suppress all output at silent level", () => {
    const log = createLogger({ level: "silent" });
    log.debug("a");
    log.info("b");
    log.warn("c");
    log.error("d");
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("should create child loggers with scope", () => {
    const log = createLogger({ level: "info" });
    const child = log.child("sandbox");
    child.info("acquired");
    expect(console.log).toHaveBeenCalledOnce();
    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
    // The prefix should contain the scope
    expect(call[0]).toContain("sandbox");
  });

  it("should nest child scopes with colon separator", () => {
    const log = createLogger({ level: "info" });
    const child = log.child("sandbox").child("pool");
    child.info("test");
    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("sandbox:pool");
  });

  it("should pass extra arguments through", () => {
    const log = createLogger({ level: "info" });
    const extra = { key: "value" };
    log.info("message", extra);
    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("message");
    expect(call[2]).toBe(extra);
  });

  it("should include timestamp in output", () => {
    const log = createLogger({ level: "info" });
    log.info("test");
    const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
    // Prefix should contain a time-like pattern HH:MM:SS
    expect(call[0]).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("should default to info level", () => {
    const log = createLogger();
    log.debug("hidden");
    log.info("visible");
    expect(console.log).toHaveBeenCalledOnce();
  });
});
