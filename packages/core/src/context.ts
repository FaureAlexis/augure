import type { Message } from "@augure/types";
import type { FunctionSchema } from "@augure/tools";

export interface ContextInput {
  systemPrompt: string;
  memoryContent: string;
  toolSchemas: FunctionSchema[];
  conversationHistory: Message[];
  persona?: string;
}

export function assembleContext(input: ContextInput): Message[] {
  const {
    systemPrompt,
    memoryContent,
    toolSchemas,
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

  if (toolSchemas.length > 0) {
    const toolList = toolSchemas
      .map((s) => `- **${s.function.name}**: ${s.function.description}`)
      .join("\n");
    system += `\n\n## Available Tools\n${toolList}`;
  }

  const messages: Message[] = [{ role: "system", content: system }];
  messages.push(...conversationHistory);

  return messages;
}
