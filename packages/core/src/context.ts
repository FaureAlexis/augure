import type { Message } from "@augure/types";

export interface ContextInput {
  systemPrompt: string;
  memoryContent: string;
  conversationHistory: Message[];
  persona?: string;
}

export function assembleContext(input: ContextInput): Message[] {
  const {
    systemPrompt,
    memoryContent,
    conversationHistory,
    persona,
  } = input;

  let system = systemPrompt;

  if (persona) {
    system += `\n\n## Active Persona\n${persona}`;
  }

  if (memoryContent) {
    system += `\n\n## Memory\n${memoryContent}`;
  }

  const messages: Message[] = [{ role: "system", content: system }];
  messages.push(...conversationHistory);

  return messages;
}
