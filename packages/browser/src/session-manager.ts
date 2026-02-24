import { Stagehand } from "@browserbasehq/stagehand";
import type { BrowserConfig, LLMModelConfig, Logger } from "@augure/types";
import { noopLogger } from "@augure/types";
import { createStagehandConfig } from "./provider.js";

interface SessionEntry {
  stagehand: Stagehand;
  timer: ReturnType<typeof setTimeout>;
}

export interface BrowserSessionManagerConfig {
  config: BrowserConfig;
  llm: LLMModelConfig;
  ttlMs?: number;
  logger?: Logger;
}

let counter = 0;

export class BrowserSessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly config: BrowserConfig;
  private readonly llm: LLMModelConfig;
  private readonly ttlMs: number;
  private readonly log: Logger;

  constructor(opts: BrowserSessionManagerConfig) {
    this.config = opts.config;
    this.llm = opts.llm;
    this.ttlMs = opts.ttlMs ?? 120_000;
    this.log = opts.logger ?? noopLogger;
  }

  async open(url?: string): Promise<string> {
    const id = `s_${Date.now()}_${++counter}`;
    const stagehandConfig = createStagehandConfig(this.config, this.llm);
    const stagehand = new Stagehand(stagehandConfig);
    await stagehand.init();

    if (url) {
      const page = stagehand.context.activePage();
      if (page) await page.goto(url, { waitUntil: "domcontentloaded" });
    }

    const timer = setTimeout(() => {
      this.log.warn(`Browser session ${id} expired (TTL ${this.ttlMs}ms)`);
      this.close(id).catch(() => {});
    }, this.ttlMs);

    this.sessions.set(id, { stagehand, timer });
    this.log.info(`Browser session ${id} opened`);
    return id;
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    const page = entry.stagehand.context.activePage();
    if (page) await page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async act(
    sessionId: string,
    instruction: string,
    variables?: Record<string, string>,
  ): Promise<{ success: boolean; message: string }> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    const result = await entry.stagehand.act(
      instruction,
      variables ? { variables } : undefined,
    );
    return { success: result.success, message: result.message ?? result.actionDescription ?? "" };
  }

  async extract(
    sessionId: string,
    instruction: string,
    schema?: Record<string, unknown>,
  ): Promise<unknown> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    if (schema) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return entry.stagehand.extract(instruction, schema as any);
    }
    return entry.stagehand.extract(instruction);
  }

  async observe(
    sessionId: string,
    instruction: string,
  ): Promise<Array<{ description: string; selector: string }>> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    const actions = await entry.stagehand.observe(instruction);
    return actions.map((a) => ({
      description: a.description ?? "",
      selector: a.selector ?? "",
    }));
  }

  async screenshot(sessionId: string): Promise<string> {
    const entry = this.getSession(sessionId);
    this.resetTtl(sessionId, entry);
    const page = entry.stagehand.context.activePage();
    if (!page) throw new Error(`No active page for session ${sessionId}`);
    const buffer = await page.screenshot();
    return Buffer.from(buffer).toString("base64");
  }

  async close(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.sessions.delete(sessionId);
    try {
      await entry.stagehand.close();
    } catch {
      // ignore close errors
    }
    this.log.info(`Browser session ${sessionId} closed`);
  }

  async closeAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  private getSession(sessionId: string): SessionEntry {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Unknown or expired: no browser session ${sessionId}`);
    return entry;
  }

  private resetTtl(sessionId: string, entry: SessionEntry): void {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      this.log.warn(`Browser session ${sessionId} expired (TTL ${this.ttlMs}ms)`);
      this.close(sessionId).catch(() => {});
    }, this.ttlMs);
  }
}
