import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const source = resolve(root, "packages/cli/CHANGELOG.md");
const dest = resolve(__dirname, "../content/docs/changelog.mdx");

const frontmatter = `---
title: Changelog
description: Release history for the augure CLI
---

`;

try {
  const raw = await readFile(source, "utf-8");
  // Strip the first "# augure" heading — the page title comes from frontmatter
  const content = raw.replace(/^#\s+.+\n+/, "");
  await writeFile(dest, frontmatter + content, "utf-8");
} catch {
  // CHANGELOG.md doesn't exist yet (first release hasn't been merged)
  await writeFile(
    dest,
    frontmatter + "No releases yet. The changelog will appear after the first versioned release.\n",
    "utf-8",
  );
}
