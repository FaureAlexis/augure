import { defineCommand } from "citty";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { FileMemoryStore } from "@augure/memory";
import { loadConfig } from "@augure/core";
import { prefix, ok, err, dim, bold, cyan } from "../colors.js";

const configArg = {
  type: "string" as const,
  description: "Path to config file",
  alias: "c",
  default: "./augure.json5",
};

function resolveMemoryPath(configPath: string, config: { memory: { path: string } }): string {
  return resolve(configPath, "..", config.memory.path);
}

const listCommand = defineCommand({
  meta: { name: "list", description: "List memory files" },
  args: {
    config: configArg,
    directory: {
      type: "positional",
      description: "Subdirectory to list",
      required: false,
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const config = await loadConfig(configPath);
    const memoryPath = resolveMemoryPath(configPath, config);
    const store = new FileMemoryStore(memoryPath);

    const files = await store.list(args.directory);
    if (files.length === 0) {
      console.log(`${prefix} ${dim("No memory files found.")}`);
      return;
    }

    console.log(bold(["PATH".padEnd(50), "SIZE"].join("")));
    for (const f of files) {
      const fullPath = resolve(memoryPath, f);
      let size = dim("?");
      try {
        const s = await stat(fullPath);
        size = formatBytes(s.size);
      } catch {
        /* stat failed */
      }
      console.log([cyan(f.padEnd(50)), dim(size)].join(""));
    }
  },
});

const showCommand = defineCommand({
  meta: { name: "show", description: "Show memory file content" },
  args: {
    config: configArg,
    path: {
      type: "positional",
      description: "Memory file path",
      required: true,
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const config = await loadConfig(configPath);
    const memoryPath = resolveMemoryPath(configPath, config);
    const store = new FileMemoryStore(memoryPath);

    try {
      const content = await store.read(args.path);
      console.log(content);
    } catch {
      console.error(`${prefix} ${err(`File not found: ${args.path}`)}`);
      process.exit(1);
    }
  },
});

const editCommand = defineCommand({
  meta: { name: "edit", description: "Edit a memory file in $EDITOR" },
  args: {
    config: configArg,
    path: {
      type: "positional",
      description: "Memory file path",
      required: true,
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const config = await loadConfig(configPath);
    const memoryPath = resolveMemoryPath(configPath, config);
    const fullPath = resolve(memoryPath, args.path);
    const editor = process.env.EDITOR ?? "vi";

    console.log(`${prefix} Opening ${cyan(args.path)} in ${editor}...`);
    const result = spawnSync(editor, [fullPath], { stdio: "inherit" });
    if (result.status === 0) {
      console.log(`${prefix} ${ok("Done.")}`);
    } else {
      console.error(`${prefix} ${err(`Editor exited with code ${result.status}`)}`);
      process.exit(1);
    }
  },
});

export const memoryCommand = defineCommand({
  meta: { name: "memory", description: "Manage agent memory" },
  subCommands: {
    list: listCommand,
    show: showCommand,
    edit: editCommand,
  },
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
