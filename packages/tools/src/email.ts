import { ImapFlow } from "imapflow";
import { createTransport } from "nodemailer";
import type { NativeTool } from "@augure/types";

const MAX_BODY_CHARS = 4000;

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

interface EmailParams {
  action: string;
  folder?: string;
  limit?: number;
  uid?: number;
  from?: string;
  subject?: string;
  since?: string;
  unseen?: boolean;
  to?: string;
  body?: string;
  cc?: string;
  bcc?: string;
}

interface EmailSummary {
  uid: number;
  subject: string;
  from: string;
  date: string;
  seen: boolean;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface MimePart {
  type?: string;
  childNodes?: MimePart[];
  part?: string;
}

function findTextPart(structure: MimePart): { part: string; isHtml: boolean } | null {
  if (structure.type === "text/plain" && structure.part) {
    return { part: structure.part, isHtml: false };
  }
  if (structure.type === "text/html" && structure.part) {
    return { part: structure.part, isHtml: true };
  }
  if (structure.childNodes) {
    let htmlFallback: { part: string; isHtml: boolean } | null = null;
    for (const child of structure.childNodes) {
      const found = findTextPart(child);
      if (found && !found.isHtml) return found;
      if (found && found.isHtml) htmlFallback = found;
    }
    return htmlFallback;
  }
  return null;
}

async function withImapClient<T>(
  config: ImapConfig,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    return await fn(client);
  } finally {
    if (connected) {
      await client.logout();
    }
  }
}

function formatSummaries(emails: EmailSummary[]): string {
  if (emails.length === 0) return "No emails found.";
  return emails
    .map(
      (e, i) =>
        `${i + 1}. ${e.seen ? "" : "[UNREAD] "}UID:${e.uid} Subject: ${e.subject} | From: ${e.from} | Date: ${e.date}`,
    )
    .join("\n");
}

function extractAddress(addr: unknown): string {
  if (!addr) return "unknown";
  if (Array.isArray(addr)) {
    const first = addr[0];
    if (first && typeof first === "object" && "address" in first) {
      return (first as { address: string }).address;
    }
    return String(first ?? "unknown");
  }
  if (typeof addr === "object" && "address" in addr) {
    return (addr as { address: string }).address;
  }
  return String(addr);
}

async function handleList(params: EmailParams, imapConfig: ImapConfig): Promise<string> {
  const folder = params.folder ?? "INBOX";
  const limit = params.limit ?? 10;

  return withImapClient(imapConfig, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const status = client.mailbox;
      if (!status || status.exists === 0) return "Mailbox is empty.";

      const start = Math.max(1, status.exists - limit + 1);
      const emails: EmailSummary[] = [];
      for await (const msg of client.fetch(`${start}:*`, {
        envelope: true,
        flags: true,
      })) {
        emails.push({
          uid: msg.uid,
          subject: msg.envelope?.subject ?? "(no subject)",
          from: extractAddress(msg.envelope?.from),
          date: msg.envelope?.date?.toISOString() ?? "unknown",
          seen: msg.flags?.has("\\Seen") ?? false,
        });
      }
      return formatSummaries(emails.slice(-limit));
    } finally {
      lock.release();
    }
  });
}

async function handleRead(params: EmailParams, imapConfig: ImapConfig): Promise<string> {
  const folder = params.folder ?? "INBOX";
  return withImapClient(imapConfig, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(String(params.uid), {
        envelope: true,
        bodyStructure: true,
        flags: true,
        uid: true,
      });

      if (!msg) return `No email found with UID ${params.uid}.`;

      let bodyText = "";
      const textPart = msg.bodyStructure ? findTextPart(msg.bodyStructure as MimePart) : null;
      if (textPart) {
        const { content } = await client.download(String(params.uid), textPart.part, {
          uid: true,
        });
        const chunks: Buffer[] = [];
        for await (const chunk of content) {
          chunks.push(Buffer.from(chunk));
        }
        bodyText = Buffer.concat(chunks).toString("utf-8");
        if (textPart.isHtml) bodyText = stripHtml(bodyText);
      }

      if (bodyText.length > MAX_BODY_CHARS) {
        bodyText = bodyText.slice(0, MAX_BODY_CHARS) + "\n[truncated]";
      }

      const wasSeen = msg.flags?.has("\\Seen") ?? false;
      await client.messageFlagsAdd(String(params.uid), ["\\Seen"], { uid: true });

      const subject = msg.envelope?.subject ?? "(no subject)";
      const from = extractAddress(msg.envelope?.from);
      const date = msg.envelope?.date?.toISOString() ?? "unknown";

      return `UID: ${params.uid}\nSubject: ${subject}\nFrom: ${from}\nDate: ${date}\nStatus: ${wasSeen ? "was read" : "was unread, marked read"}\n\n${bodyText}`;
    } finally {
      lock.release();
    }
  });
}

async function handleSearch(params: EmailParams, imapConfig: ImapConfig): Promise<string> {
  const folder = params.folder ?? "INBOX";
  const limit = params.limit ?? 10;

  return withImapClient(imapConfig, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const criteria: Record<string, unknown> = {};
      if (params.from) criteria.from = params.from;
      if (params.subject) criteria.subject = params.subject;
      if (params.since) criteria.since = new Date(params.since);
      if (params.unseen) criteria.seen = false;

      const result = await client.search(criteria, { uid: true });
      const uids = Array.isArray(result) ? result : [];
      if (uids.length === 0) return "No emails match the search criteria.";

      const selected = uids.slice(-limit);
      const emails: EmailSummary[] = [];
      for await (const msg of client.fetch(
        selected,
        { envelope: true, flags: true },
        { uid: true },
      )) {
        emails.push({
          uid: msg.uid,
          subject: msg.envelope?.subject ?? "(no subject)",
          from: extractAddress(msg.envelope?.from),
          date: msg.envelope?.date?.toISOString() ?? "unknown",
          seen: msg.flags?.has("\\Seen") ?? false,
        });
      }

      return formatSummaries(emails);
    } finally {
      lock.release();
    }
  });
}

async function handleSend(params: EmailParams, smtpConfig: SmtpConfig): Promise<string> {
  const transport = createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.port === 465,
    auth: { user: smtpConfig.user, pass: smtpConfig.password },
  });

  const info = await transport.sendMail({
    from: smtpConfig.user,
    to: params.to,
    subject: params.subject,
    text: params.body,
    cc: params.cc,
    bcc: params.bcc,
  });

  return `Email sent. Message ID: ${info.messageId}`;
}

export const emailTool: NativeTool = {
  name: "email",
  description:
    "Manage email: list recent messages, read by UID, search with criteria, or send an email via SMTP",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "read", "search", "send"],
        description: "The email action to perform",
      },
      folder: {
        type: "string",
        description: 'IMAP folder (default: "INBOX"). Used by list, read, search.',
      },
      limit: {
        type: "number",
        description: "Max emails to return (default: 10). Used by list, search.",
      },
      uid: { type: "number", description: "Email UID to read. Required for read." },
      from: { type: "string", description: "Filter by sender address. Used by search." },
      subject: {
        type: "string",
        description: "Filter by subject (search) or email subject (send).",
      },
      since: {
        type: "string",
        description: "ISO 8601 date — emails since this date. Used by search.",
      },
      unseen: { type: "boolean", description: "Only unread emails. Used by search." },
      to: { type: "string", description: "Recipient address. Required for send." },
      body: { type: "string", description: "Email body text. Required for send." },
      cc: { type: "string", description: "CC recipients. Used by send." },
      bcc: { type: "string", description: "BCC recipients. Used by send." },
    },
    required: ["action"],
  },
  execute: async (params, ctx) => {
    const p = params as EmailParams;
    const emailConfig = ctx.config.tools?.email;

    if (!emailConfig) {
      return { success: false, output: "Email is not configured. Add tools.email to your config." };
    }

    try {
      switch (p.action) {
        case "list":
          return { success: true, output: await handleList(p, emailConfig.imap) };
        case "read":
          if (!p.uid) return { success: false, output: "Missing required field: uid" };
          return { success: true, output: await handleRead(p, emailConfig.imap) };
        case "search":
          if (!p.from && !p.subject && !p.since && p.unseen === undefined)
            return { success: false, output: "At least one search criterion is required (from, subject, since, or unseen)." };
          return { success: true, output: await handleSearch(p, emailConfig.imap) };
        case "send":
          if (!p.to) return { success: false, output: "Missing required field: to" };
          if (!p.subject) return { success: false, output: "Missing required field: subject" };
          if (!p.body) return { success: false, output: "Missing required field: body" };
          return { success: true, output: await handleSend(p, emailConfig.smtp) };
        default:
          return { success: false, output: `Unknown action: ${p.action}` };
      }
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
