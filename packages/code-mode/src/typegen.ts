import type { ToolRegistry } from "@augure/tools";

const JSON_TO_TS: Record<string, string> = {
  string: "string",
  number: "number",
  integer: "number",
  boolean: "boolean",
  array: "unknown[]",
  object: "Record<string, unknown>",
};

export function sanitizeName(name: string): string {
  return name.replace(/[-. ]/g, "_");
}

function toPascalCase(name: string): string {
  return sanitizeName(name)
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function mapType(schema: Record<string, unknown>): string {
  const t = schema.type as string | undefined;
  if (schema.enum) {
    return (schema.enum as string[]).map((v) => `"${v}"`).join(" | ");
  }
  return JSON_TO_TS[t ?? "string"] ?? "unknown";
}

export function generateDeclarations(registry: ToolRegistry): string {
  const tools = registry.list();
  const blocks: string[] = [];
  const apiEntries: string[] = [];

  for (const tool of tools) {
    const safeName = sanitizeName(tool.name);
    const interfaceName = `${toPascalCase(tool.name)}Input`;
    const params = tool.parameters as {
      properties?: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    const properties = params.properties ?? {};
    const required = new Set(params.required ?? []);

    const fields: string[] = [];
    for (const [key, schema] of Object.entries(properties)) {
      const optional = required.has(key) ? "" : "?";
      const tsType = mapType(schema);
      const desc = schema.description as string | undefined;
      if (desc) {
        fields.push(`  /** ${desc} */\n  ${key}${optional}: ${tsType};`);
      } else {
        fields.push(`  ${key}${optional}: ${tsType};`);
      }
    }

    blocks.push(`interface ${interfaceName} {\n${fields.join("\n")}\n}`);
    apiEntries.push(
      `  /** ${tool.description} */\n  ${safeName}: (input: ${interfaceName}) => Promise<{ success: boolean; output: string }>;`,
    );
  }

  const apiBlock = `declare const api: {\n${apiEntries.join("\n")}\n};`;
  return [...blocks, "", apiBlock].join("\n");
}
