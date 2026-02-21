import type { LLMClient, Message, MemoryStore } from "@augure/types";

const EXTRACTION_PROMPT = `You are a memory extraction agent. Given a conversation, extract key factual observations about the user.

Rules:
- Return a markdown bullet list of observations (one per line, starting with "- ")
- Only extract facts, preferences, decisions, plans, and personal details
- Be concise: one fact per bullet
- If there are no notable observations, return exactly "No notable observations."
- Do not include greetings, small talk, or meta-conversation
- Use present tense ("User prefers X", not "User said they prefer X")

Example output:
- User prefers TypeScript over JavaScript
- User is building a project called Augure
- User lives in Bordeaux, France`;

export class MemoryIngester {
  constructor(
    private readonly llm: LLMClient,
    private readonly store: MemoryStore,
  ) {}

  async ingest(conversation: Message[]): Promise<void> {
    if (conversation.length === 0) return;

    const conversationText = conversation
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const messages: Message[] = [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: conversationText },
    ];

    const response = await this.llm.chat(messages);
    const observations = this.parseObservations(response.content);

    if (observations.length === 0) return;

    const date = new Date().toISOString().slice(0, 10);
    const block = `## ${date}\n${observations.map((o) => `- ${o}`).join("\n")}\n\n`;

    await this.store.append("observations.md", block);
  }

  private parseObservations(content: string): string[] {
    const lines = content.split("\n");
    return lines
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => line.trim().slice(2).trim())
      .filter((line) => line.length > 0);
  }
}
