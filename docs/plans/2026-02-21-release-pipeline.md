# Release Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the `augure` CLI package, set up changesets for versioning, and add GitHub Actions for CI and npm publishing — so users can `npm install -g augure` and run their agent.

**Architecture:** A new `packages/cli/` package is published as `augure` on npm. It uses citty for argument parsing and imports `startAgent()` from `@augure/core`. All other packages remain private workspace packages. Changesets manages versioning and CHANGELOG. Two GitHub Actions workflows handle CI (build/test/lint on PRs) and release (npm publish on master).

**Tech Stack:** TypeScript 5.9, citty 0.2, @changesets/cli 2.29, pnpm 10, GitHub Actions

---

### Task 1: Extract startAgent from main.ts into a clean export

Currently `packages/core/src/main.ts` both defines `startAgent()` and immediately calls it with `process.argv`. The CLI package needs to import `startAgent` without side effects. We must separate the function from the CLI invocation.

**Files:**
- Modify: `packages/core/src/main.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Remove the CLI invocation from main.ts**

In `packages/core/src/main.ts`, delete the last 4 lines (160-164):

```typescript
const configPath = process.argv[2] ?? "./config/augure.json5";
startAgent(configPath).catch((err) => {
  console.error("[augure] Fatal error:", err);
  process.exit(1);
});
```

The file now only exports the `startAgent` function and `resolveLLMClient` helper. No side effects on import.

**Step 2: Re-export startAgent from index.ts**

In `packages/core/src/index.ts`, add at the end:

```typescript
export { startAgent } from "./main.js";
```

**Step 3: Verify build**

Run: `cd /Users/alexis/lab/augure && pnpm build`
Expected: All packages build successfully.

**Step 4: Run existing tests**

Run: `cd /Users/alexis/lab/augure && pnpm test`
Expected: All tests pass (no test called `startAgent` directly).

**Step 5: Commit**

```bash
git add packages/core/src/main.ts packages/core/src/index.ts
git commit -m "refactor(core): export startAgent without side effects"
```

---

### Task 2: Create packages/cli/ package scaffolding

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`

**Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "augure",
  "version": "0.1.0",
  "description": "Augure — your proactive AI agent",
  "type": "module",
  "bin": {
    "augure": "./dist/bin.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "@augure/core": "workspace:*",
    "@augure/channels": "workspace:*",
    "@augure/memory": "workspace:*",
    "@augure/scheduler": "workspace:*",
    "@augure/tools": "workspace:*",
    "@augure/types": "workspace:*",
    "citty": "^0.2.1"
  },
  "keywords": ["ai", "agent", "assistant", "telegram", "llm"],
  "license": "MIT"
}
```

**Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [
    { "path": "../types" },
    { "path": "../core" }
  ]
}
```

**Step 3: Create `packages/cli/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 4: Install dependencies**

Run: `cd /Users/alexis/lab/augure && pnpm install`
Expected: Lockfile updated, citty installed in packages/cli.

**Step 5: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(cli): scaffold augure CLI package"
```

---

### Task 3: Implement the CLI entry point with citty

**Files:**
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/init.ts`

**Step 1: Create the main CLI entry point**

Create `packages/cli/src/bin.ts`:

```typescript
#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { startCommand } from "./commands/start.js";
import { initCommand } from "./commands/init.js";

const main = defineCommand({
  meta: {
    name: "augure",
    description: "Augure — your proactive AI agent",
    version: "0.1.0",
  },
  subCommands: {
    start: startCommand,
    init: initCommand,
  },
});

runMain(main);
```

**Step 2: Create the start command**

Create `packages/cli/src/commands/start.ts`:

```typescript
import { defineCommand } from "citty";
import { resolve } from "node:path";

export const startCommand = defineCommand({
  meta: {
    name: "start",
    description: "Start the Augure agent",
  },
  args: {
    config: {
      type: "string",
      description: "Path to config file",
      alias: "c",
      default: "./augure.json5",
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    console.log(`[augure] Starting with config: ${configPath}`);

    const { startAgent } = await import("@augure/core");
    await startAgent(configPath);
  },
});
```

**Step 3: Create the init command**

Create `packages/cli/src/commands/init.ts`:

```typescript
import { defineCommand } from "citty";
import { writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const CONFIG_TEMPLATE = `{
  // Identity
  identity: {
    name: "Augure",
    personality: "Helpful, proactive, concise.",
  },

  // LLM
  llm: {
    default: {
      provider: "openrouter",
      apiKey: "\${OPENROUTER_API_KEY}",
      model: "anthropic/claude-sonnet-4-5",
      maxTokens: 8192,
    },
  },

  // Channels
  channels: {
    telegram: {
      enabled: true,
      botToken: "\${TELEGRAM_BOT_TOKEN}",
      allowedUsers: [], // Add your Telegram user ID
    },
  },

  // Memory
  memory: {
    path: "./memory",
    autoIngest: true,
    maxRetrievalTokens: 2000,
  },

  // Scheduler
  scheduler: {
    heartbeatInterval: "30m",
    jobs: [],
  },

  // Sandbox
  sandbox: {
    runtime: "docker",
    defaults: {
      timeout: 300,
      memoryLimit: "512m",
      cpuLimit: "1.0",
    },
  },

  // Tools
  tools: {},

  // Security
  security: {
    sandboxOnly: true,
    allowedHosts: [],
    maxConcurrentSandboxes: 3,
  },
}
`;

const ENV_TEMPLATE = `# LLM Provider
OPENROUTER_API_KEY=sk-or-...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
`;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Initialize Augure configuration in the current directory",
  },
  async run() {
    const configPath = resolve("augure.json5");
    const envPath = resolve(".env");

    if (await fileExists(configPath)) {
      console.log(`[augure] augure.json5 already exists, skipping.`);
    } else {
      await writeFile(configPath, CONFIG_TEMPLATE, "utf-8");
      console.log(`[augure] Created augure.json5`);
    }

    if (await fileExists(envPath)) {
      console.log(`[augure] .env already exists, skipping.`);
    } else {
      await writeFile(envPath, ENV_TEMPLATE, "utf-8");
      console.log(`[augure] Created .env`);
    }

    console.log(`\nNext steps:`);
    console.log(`  1. Edit augure.json5 with your settings`);
    console.log(`  2. Fill in .env with your API keys`);
    console.log(`  3. Run: augure start`);
  },
});
```

**Step 4: Build and verify**

Run: `cd /Users/alexis/lab/augure && pnpm build`
Expected: `packages/cli/dist/bin.js` exists.

**Step 5: Test the CLI locally**

Run: `node /Users/alexis/lab/augure/packages/cli/dist/bin.js --version`
Expected: Prints version info.

Run: `node /Users/alexis/lab/augure/packages/cli/dist/bin.js --help`
Expected: Shows help with `start` and `init` subcommands.

**Step 6: Commit**

```bash
git add packages/cli/src/
git commit -m "feat(cli): add augure CLI with start and init commands"
```

---

### Task 4: Wire the init command test

**Files:**
- Create: `packages/cli/src/__tests__/init.test.ts`

**Step 1: Write the test**

Create `packages/cli/src/__tests__/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const BIN = join(__dirname, "../../dist/bin.js");

describe("augure init", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "augure-init-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should create augure.json5 and .env", () => {
    execFileSync("node", [BIN, "init"], { cwd: dir, encoding: "utf-8" });

    const config = readFileSync(join(dir, "augure.json5"), "utf-8");
    const env = readFileSync(join(dir, ".env"), "utf-8");

    expect(config).toContain("identity");
    expect(config).toContain("OPENROUTER_API_KEY");
    expect(env).toContain("OPENROUTER_API_KEY");
  });

  it("should not overwrite existing files", async () => {
    await writeFile(join(dir, "augure.json5"), "existing", "utf-8");

    const output = execFileSync("node", [BIN, "init"], {
      cwd: dir,
      encoding: "utf-8",
    });

    expect(output).toContain("already exists");

    const content = await readFile(join(dir, "augure.json5"), "utf-8");
    expect(content).toBe("existing");
  });
});
```

Note: This test imports `readFileSync` — adjust to async `readFile` with `await` as needed if using the async versions. The test uses `execFileSync` to run the actual CLI binary, so it requires a build first.

Actually, let's use a simpler approach that tests the init logic directly rather than spawning a process:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// We'll test the init logic by importing internals
// For now, test via process spawn since citty commands aren't easily unit-testable

describe("augure init", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "augure-init-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("should create config and env files via CLI", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);

    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;
    await run("node", [binPath, "init"], { cwd: dir });

    const config = await readFile(join(dir, "augure.json5"), "utf-8");
    const env = await readFile(join(dir, ".env"), "utf-8");

    expect(config).toContain("identity");
    expect(config).toContain("OPENROUTER_API_KEY");
    expect(env).toContain("OPENROUTER_API_KEY");
  });

  it("should not overwrite existing config", async () => {
    await writeFile(join(dir, "augure.json5"), "existing", "utf-8");

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);

    const binPath = new URL("../../dist/bin.js", import.meta.url).pathname;
    const { stdout } = await run("node", [binPath, "init"], { cwd: dir });

    expect(stdout).toContain("already exists");

    const content = await readFile(join(dir, "augure.json5"), "utf-8");
    expect(content).toBe("existing");
  });
});
```

**Step 2: Build first (test needs the dist)**

Run: `cd /Users/alexis/lab/augure && pnpm build`

**Step 3: Run the test**

Run: `cd /Users/alexis/lab/augure && pnpm --filter augure test`
Expected: PASS — 2 tests.

**Step 4: Commit**

```bash
git add packages/cli/src/__tests__/
git commit -m "test(cli): add init command tests"
```

---

### Task 5: Setup changesets

**Files:**
- Create: `.changeset/config.json`
- Modify: root `package.json` (add changeset scripts)

**Step 1: Install changesets**

Run: `cd /Users/alexis/lab/augure && pnpm add -Dw @changesets/cli`

**Step 2: Initialize changesets**

Run: `cd /Users/alexis/lab/augure && pnpm changeset init`

This creates `.changeset/config.json` and `.changeset/README.md`.

**Step 3: Configure changesets for single-package publish**

Edit `.changeset/config.json` to:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@augure/types",
    "@augure/core",
    "@augure/channels",
    "@augure/memory",
    "@augure/scheduler",
    "@augure/tools",
    "@augure/sandbox",
    "@augure/skills"
  ]
}
```

The `ignore` field ensures changesets only versions/publishes the `augure` CLI package. All `@augure/*` packages are private and should not be versioned by changesets.

**Step 4: Add changeset scripts to root package.json**

Add to root `package.json` scripts:

```json
{
  "scripts": {
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && changeset publish"
  }
}
```

(Keep all existing scripts, just add these three.)

**Step 5: Verify it works**

Run: `cd /Users/alexis/lab/augure && pnpm changeset status`
Expected: No changesets found (that's fine — we haven't created any yet).

**Step 6: Commit**

```bash
git add .changeset/ package.json pnpm-lock.yaml
git commit -m "chore: setup changesets for versioning"
```

---

### Task 6: GitHub Actions — CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - run: pnpm lint

      - run: pnpm typecheck

      - run: pnpm test
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI workflow"
```

---

### Task 7: GitHub Actions — Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [master]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - run: pnpm test

      - name: Create Release PR or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          version: pnpm version-packages
          publish: pnpm release
          title: "chore: version packages"
          commit: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

This workflow does two things depending on state:
1. If there are pending changesets → opens/updates a "Version Packages" PR
2. If the "Version Packages" PR was just merged (no pending changesets, versions bumped) → publishes to npm

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow with changesets"
```

---

### Task 8: Configure packages for npm publish

The `augure` CLI package needs proper `files` and `publishConfig`. The private packages need `"private": true` to prevent accidental publish. Let's verify and fix.

**Files:**
- Modify: `packages/cli/package.json` (already has `files`)
- Verify: all other `packages/*/package.json` have `"private": true`

**Step 1: Verify private packages**

Check each `packages/*/package.json` (except cli) has `"private": true`. They already do based on the codebase analysis. No changes needed.

**Step 2: Add publishConfig to CLI package**

In `packages/cli/package.json`, add:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 3: Add repository field to CLI package**

In `packages/cli/package.json`, add:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/alexMusic/augure.git",
    "directory": "packages/cli"
  }
}
```

Note: Replace the URL with the actual GitHub repo URL when known.

**Step 4: Verify pnpm publish would work (dry run)**

Run: `cd /Users/alexis/lab/augure && pnpm --filter augure publish --dry-run --no-git-checks`
Expected: Shows the files that would be published (dist/, package.json, etc.). Should NOT include src/ or node_modules/.

**Step 5: Commit**

```bash
git add packages/cli/package.json
git commit -m "chore(cli): add publishConfig and repository fields"
```

---

### Task 9: Add .npmrc for publish auth

**Files:**
- Create: `.npmrc` (if not exists, or modify)

**Step 1: Create/update `.npmrc`**

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

This is used by CI. Locally, developers authenticate via `npm login`.

**Step 2: Add .npmrc to .gitignore if it contains secrets**

Actually, the `.npmrc` above only has `${NPM_TOKEN}` which is resolved from env. It's safe to commit. But let's make sure `.env` is in `.gitignore` (it already is).

**Step 3: Commit**

```bash
git add .npmrc
git commit -m "chore: add .npmrc for npm publish auth in CI"
```

---

### Task 10: Move main.ts direct invocation to CLI and update Dockerfile

The Dockerfile currently runs `node packages/core/dist/main.js` which we removed the direct invocation from in Task 1. Update it to use the CLI.

**Files:**
- Modify: `Dockerfile`

**Step 1: Update Dockerfile CMD**

Change the last line of `Dockerfile` from:

```dockerfile
CMD ["node", "packages/core/dist/main.js", "/app/config/augure.json5"]
```

to:

```dockerfile
CMD ["node", "packages/cli/dist/bin.js", "start", "--config", "/app/config/augure.json5"]
```

**Step 2: Verify Docker build**

Run: `cd /Users/alexis/lab/augure && docker build -t augure-test .`
Expected: Build succeeds. (Don't need to run it — just verify it builds.)

If Docker is not available locally, just verify the Dockerfile looks correct.

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "fix: update Dockerfile to use CLI entry point"
```

---

### Task 11: Create first changeset and verify the full flow

**Files:**
- Create: `.changeset/*.md` (generated by CLI)

**Step 1: Build everything**

Run: `cd /Users/alexis/lab/augure && pnpm install && pnpm build`
Expected: All packages build.

**Step 2: Run all tests**

Run: `cd /Users/alexis/lab/augure && pnpm test`
Expected: All tests pass.

**Step 3: Run typecheck**

Run: `cd /Users/alexis/lab/augure && pnpm typecheck`
Expected: No errors.

**Step 4: Run lint**

Run: `cd /Users/alexis/lab/augure && pnpm lint`
Expected: No errors.

**Step 5: Create first changeset**

Run: `cd /Users/alexis/lab/augure && pnpm changeset`

When prompted:
- Select `augure` as the package
- Choose `minor` (first feature release)
- Description: "Add CLI with init and start commands, npm publish pipeline"

This creates a file like `.changeset/fuzzy-cats-dance.md`.

**Step 6: Verify changeset status**

Run: `cd /Users/alexis/lab/augure && pnpm changeset status`
Expected: Shows 1 changeset pending for `augure`.

**Step 7: Commit**

```bash
git add .changeset/
git commit -m "chore: add initial changeset for v0.1.0"
```

---

## Summary

| Task | What it does | Files |
|------|-------------|-------|
| 1 | Extract startAgent as clean export | core/main.ts, core/index.ts |
| 2 | Scaffold packages/cli/ | cli/package.json, cli/tsconfig.json |
| 3 | Implement CLI (citty, start, init) | cli/src/bin.ts, cli/src/commands/* |
| 4 | Test the init command | cli/src/__tests__/init.test.ts |
| 5 | Setup changesets | .changeset/config.json, root package.json |
| 6 | CI workflow | .github/workflows/ci.yml |
| 7 | Release workflow | .github/workflows/release.yml |
| 8 | Configure for npm publish | cli/package.json tweaks |
| 9 | npm auth config | .npmrc |
| 10 | Update Dockerfile for CLI | Dockerfile |
| 11 | First changeset + full verification | .changeset/*.md |

**Total: 11 tasks. After completion, `npm install -g augure` will work.**
