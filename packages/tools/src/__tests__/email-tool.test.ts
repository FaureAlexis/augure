import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext, MemoryStore, Scheduler } from "@augure/types";

// Mock imapflow before importing the tool
vi.mock("imapflow", () => {
  const ImapFlow = vi.fn();
  return { ImapFlow };
});

vi.mock("nodemailer", () => ({
  createTransport: vi.fn(),
}));

import { emailTool } from "../email.js";
import { ImapFlow } from "imapflow";
import { createTransport } from "nodemailer";

const MockImapFlow = ImapFlow as unknown as ReturnType<typeof vi.fn>;
const mockCreateTransport = createTransport as unknown as ReturnType<typeof vi.fn>;

function makeEmailConfig() {
  return {
    imap: { host: "imap.test.com", port: 993, user: "user@test.com", password: "pass" },
    smtp: { host: "smtp.test.com", port: 587, user: "user@test.com", password: "pass" },
  };
}

function makeCtx(emailConfig?: ReturnType<typeof makeEmailConfig>): ToolContext {
  return {
    config: {
      tools: emailConfig ? { email: emailConfig } : {},
    } as ToolContext["config"],
    memory: {} as MemoryStore,
    scheduler: {} as Scheduler,
  };
}

/** Helper to create an async iterable from an array */
function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < items.length) return { value: items[i++], done: false };
          return { value: undefined as unknown as T, done: true };
        },
      };
    },
  };
}

function setupImapMock(overrides: Record<string, unknown> = {}) {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
    mailbox: { exists: 5 },
    fetch: vi.fn().mockReturnValue(asyncIterable([])),
    fetchOne: vi.fn().mockResolvedValue(null),
    download: vi.fn().mockResolvedValue({ content: asyncIterable([]) }),
    messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  // Use regular function (not arrow) so it can be called with `new`
  MockImapFlow.mockImplementation(function () { return mockClient; });
  return mockClient;
}

describe("emailTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Guard tests ---
  describe("guards", () => {
    it("should return error when email is not configured", async () => {
      const ctx = makeCtx();
      const result = await emailTool.execute({ action: "list" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("not configured");
    });

    it("should return error for unknown action", async () => {
      const ctx = makeCtx(makeEmailConfig());
      setupImapMock();
      const result = await emailTool.execute({ action: "unknown" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown action");
    });
  });

  // --- List tests ---
  describe("list", () => {
    it("should list recent emails from inbox", async () => {
      const emails = [
        {
          uid: 101,
          envelope: {
            subject: "Hello",
            from: [{ address: "alice@test.com" }],
            date: new Date("2025-01-01"),
          },
          flags: new Set(["\\Seen"]),
        },
        {
          uid: 102,
          envelope: {
            subject: "Meeting",
            from: [{ address: "bob@test.com" }],
            date: new Date("2025-01-02"),
          },
          flags: new Set(),
        },
      ];
      setupImapMock({ fetch: vi.fn().mockReturnValue(asyncIterable(emails)) });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "list" }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain("UID:101");
      expect(result.output).toContain("Hello");
      expect(result.output).toContain("[UNREAD]");
      expect(result.output).toContain("alice@test.com");
    });

    it("should handle empty mailbox", async () => {
      setupImapMock({ mailbox: { exists: 0 } });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "list" }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain("empty");
    });

    it("should use custom folder", async () => {
      const mockClient = setupImapMock();
      const ctx = makeCtx(makeEmailConfig());
      await emailTool.execute({ action: "list", folder: "Sent" }, ctx);
      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("Sent");
    });

    it("should respect limit parameter", async () => {
      const emails = Array.from({ length: 3 }, (_, i) => ({
        uid: i + 1,
        envelope: {
          subject: `Email ${i}`,
          from: [{ address: "test@test.com" }],
          date: new Date(),
        },
        flags: new Set(),
      }));
      const mockClient = setupImapMock({
        mailbox: { exists: 100 },
        fetch: vi.fn().mockReturnValue(asyncIterable(emails)),
      });
      const ctx = makeCtx(makeEmailConfig());
      await emailTool.execute({ action: "list", limit: 3 }, ctx);
      // sequence range should start at 100-3+1=98
      expect(mockClient.fetch).toHaveBeenCalledWith("98:*", expect.any(Object));
    });
  });

  // --- Read tests ---
  describe("read", () => {
    it("should read email by UID and mark as seen", async () => {
      const msg = {
        uid: 42,
        envelope: {
          subject: "Important",
          from: [{ address: "sender@test.com" }],
          date: new Date("2025-06-01"),
        },
        flags: new Set(),
        bodyStructure: { type: "text/plain", part: "1" },
      };
      const bodyContent = Buffer.from("Hello, this is the email body.");
      const mockClient = setupImapMock({
        fetchOne: vi.fn().mockResolvedValue(msg),
        download: vi.fn().mockResolvedValue({ content: asyncIterable([bodyContent]) }),
      });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "read", uid: 42 }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain("Important");
      expect(result.output).toContain("Hello, this is the email body.");
      expect(result.output).toContain("was unread, marked read");
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith("42", ["\\Seen"], { uid: true });
    });

    it("should return error when uid is missing", async () => {
      setupImapMock();
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "read" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("uid");
    });

    it("should fallback to HTML and strip tags", async () => {
      const msg = {
        uid: 50,
        envelope: {
          subject: "HTML Email",
          from: [{ address: "html@test.com" }],
          date: new Date(),
        },
        flags: new Set(),
        bodyStructure: { type: "text/html", part: "1" },
      };
      const htmlBody = Buffer.from(
        "<html><body><p>Hello</p><br><b>World</b><script>alert('x')</script></body></html>",
      );
      setupImapMock({
        fetchOne: vi.fn().mockResolvedValue(msg),
        download: vi.fn().mockResolvedValue({ content: asyncIterable([htmlBody]) }),
      });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "read", uid: 50 }, ctx);
      expect(result.output).toContain("Hello");
      expect(result.output).toContain("World");
      expect(result.output).not.toContain("<script>");
      expect(result.output).not.toContain("alert");
    });

    it("should truncate long body", async () => {
      const msg = {
        uid: 60,
        envelope: {
          subject: "Long",
          from: [{ address: "long@test.com" }],
          date: new Date(),
        },
        flags: new Set(),
        bodyStructure: { type: "text/plain", part: "1" },
      };
      const longBody = Buffer.from("x".repeat(5000));
      setupImapMock({
        fetchOne: vi.fn().mockResolvedValue(msg),
        download: vi.fn().mockResolvedValue({ content: asyncIterable([longBody]) }),
      });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "read", uid: 60 }, ctx);
      expect(result.output).toContain("[truncated]");
    });
  });

  // --- Search tests ---
  describe("search", () => {
    it("should search by from", async () => {
      const emails = [
        {
          uid: 10,
          envelope: {
            subject: "Found",
            from: [{ address: "search@test.com" }],
            date: new Date(),
          },
          flags: new Set(),
        },
      ];
      const mockClient = setupImapMock({
        search: vi.fn().mockResolvedValue([10]),
        fetch: vi.fn().mockReturnValue(asyncIterable(emails)),
      });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "search", from: "search@test.com" }, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toContain("Found");
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ from: "search@test.com" }),
        { uid: true },
      );
    });

    it("should search by unseen", async () => {
      const mockClient = setupImapMock({
        search: vi.fn().mockResolvedValue([1, 2]),
        fetch: vi.fn().mockReturnValue(
          asyncIterable([
            {
              uid: 1,
              envelope: { subject: "A", from: [{ address: "a@t.com" }], date: new Date() },
              flags: new Set(),
            },
            {
              uid: 2,
              envelope: { subject: "B", from: [{ address: "b@t.com" }], date: new Date() },
              flags: new Set(),
            },
          ]),
        ),
      });
      const ctx = makeCtx(makeEmailConfig());
      await emailTool.execute({ action: "search", unseen: true }, ctx);
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ seen: false }),
        { uid: true },
      );
    });

    it("should search by subject and since", async () => {
      const mockClient = setupImapMock({
        search: vi.fn().mockResolvedValue([5]),
        fetch: vi.fn().mockReturnValue(
          asyncIterable([
            {
              uid: 5,
              envelope: { subject: "Report", from: [{ address: "r@t.com" }], date: new Date() },
              flags: new Set(["\\Seen"]),
            },
          ]),
        ),
      });
      const ctx = makeCtx(makeEmailConfig());
      await emailTool.execute({
        action: "search",
        subject: "Report",
        since: "2025-01-01",
      }, ctx);
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Report",
          since: new Date("2025-01-01"),
        }),
        { uid: true },
      );
    });

    it("should return error when no criteria provided", async () => {
      setupImapMock();
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "search" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("At least one search criterion");
    });

    it("should handle no results", async () => {
      setupImapMock({ search: vi.fn().mockResolvedValue([]) });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "search", from: "nobody@x.com" }, ctx);
      expect(result.output).toContain("No emails match");
    });
  });

  // --- Send tests ---
  describe("send", () => {
    it("should send email and return messageId", async () => {
      const mockTransport = {
        sendMail: vi.fn().mockResolvedValue({ messageId: "<abc@test.com>" }),
      };
      mockCreateTransport.mockReturnValue(mockTransport);
      setupImapMock();
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute(
        { action: "send", to: "dest@test.com", subject: "Hi", body: "Hello!" },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain("<abc@test.com>");
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "dest@test.com",
          subject: "Hi",
          text: "Hello!",
        }),
      );
    });

    it("should include cc and bcc", async () => {
      const mockTransport = {
        sendMail: vi.fn().mockResolvedValue({ messageId: "<def@test.com>" }),
      };
      mockCreateTransport.mockReturnValue(mockTransport);
      setupImapMock();
      const ctx = makeCtx(makeEmailConfig());
      await emailTool.execute(
        {
          action: "send",
          to: "dest@test.com",
          subject: "Hi",
          body: "Hello!",
          cc: "cc@test.com",
          bcc: "bcc@test.com",
        },
        ctx,
      );
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ cc: "cc@test.com", bcc: "bcc@test.com" }),
      );
    });

    it("should return error when required fields are missing", async () => {
      setupImapMock();
      const ctx = makeCtx(makeEmailConfig());
      const r1 = await emailTool.execute({ action: "send" }, ctx);
      expect(r1.success).toBe(false);
      expect(r1.output).toContain("to");
      const r2 = await emailTool.execute({ action: "send", to: "a@b.com" }, ctx);
      expect(r2.success).toBe(false);
      expect(r2.output).toContain("subject");
      const r3 = await emailTool.execute(
        { action: "send", to: "a@b.com", subject: "Hi" },
        ctx,
      );
      expect(r3.success).toBe(false);
      expect(r3.output).toContain("body");
    });

    it("should handle SMTP error", async () => {
      const mockTransport = {
        sendMail: vi.fn().mockRejectedValue(new Error("SMTP auth failed")),
      };
      mockCreateTransport.mockReturnValue(mockTransport);
      setupImapMock();
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute(
        { action: "send", to: "dest@test.com", subject: "Hi", body: "Hello!" },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.output).toContain("SMTP auth failed");
    });
  });

  // --- Connection tests ---
  describe("connection", () => {
    it("should handle IMAP connection failure", async () => {
      const mockClient = {
        connect: vi.fn().mockRejectedValue(new Error("Connection refused")),
        logout: vi.fn().mockResolvedValue(undefined),
      };
      MockImapFlow.mockImplementation(function () { return mockClient; });
      const ctx = makeCtx(makeEmailConfig());
      const result = await emailTool.execute({ action: "list" }, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain("Connection refused");
      expect(mockClient.logout).not.toHaveBeenCalled();
    });

    it("should call logout even on error", async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        getMailboxLock: vi.fn().mockRejectedValue(new Error("Lock failed")),
      };
      MockImapFlow.mockImplementation(function () { return mockClient; });
      const ctx = makeCtx(makeEmailConfig());
      await emailTool.execute({ action: "list" }, ctx);
      expect(mockClient.logout).toHaveBeenCalled();
    });
  });
});
