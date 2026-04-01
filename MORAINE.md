# MORAINE.md

> Auto-generated context for FaureAlexis/augure

## Architecture

- **Pattern:** Layered monorepo with shared types at base, feature packages in middle, and orchestrator at top
- **Layers:** @augure/types, @augure/* feature packages, @augure/core orchestrator, augure CLI
- **Boundaries:** packages/@augure/types has zero dependencies. Feature packages (@augure/memory, @augure/tools, @augure/browser, @augure/channels, @augure/scheduler, @augure/sandbox, @augure/skills, @augure/code-mode) depend only on types. @augure/core depends on all feature packages. CLI (augure) depends only on core. apps/docs is independent.
- **Notes:** ESM-only TypeScript monorepo with pnpm workspaces and Turborepo. Filesystem-first architecture with no database - all persistence is file-based. Docker sandboxing for secure code execution.

## Modules

### @augure/types
- **Path:** `packages/types`
- **Responsibility:** Shared TypeScript interfaces and contracts. Zero dependencies. Defines LLMClient, Message, ToolCall, config schemas, and all domain types used across the monorepo.

### @augure/memory
- **Path:** `packages/memory`
- **Responsibility:** File-based persistent memory store with LLM-powered ingestion and retrieval. Implements memory observation extraction and semantic search without vector databases.
- **Dependencies:** @augure/types

### @augure/browser
- **Path:** `packages/browser`
- **Responsibility:** AI-powered browser automation via Stagehand wrapper. Session-based BrowserSessionManager with TTL auto-cleanup. Supports local Playwright and cloud Browserbase providers.
- **Dependencies:** @augure/types

### @augure/tools
- **Path:** `packages/tools`
- **Responsibility:** NativeTool registry with 10+ built-in tools including memory, schedule, web_search, http, sandbox_exec, opencode, github, and email tools.
- **Dependencies:** @augure/types, @augure/browser, @octokit/rest, imapflow, nodemailer

### @augure/channels
- **Path:** `packages/channels`
- **Responsibility:** Channel adapters for external communication. Currently implements Telegram via grammY with middleware pipeline. Extensible for additional channels.
- **Dependencies:** @augure/types, grammy

### @augure/scheduler
- **Path:** `packages/scheduler`
- **Responsibility:** Job scheduling with node-cron, heartbeat monitoring, and job persistence. Drives proactive agent behavior via cron jobs and periodic health checks.
- **Dependencies:** @augure/types, node-cron

### @augure/sandbox
- **Path:** `packages/sandbox`
- **Responsibility:** Docker container pool with idle caching and trust-level isolation. Secure code execution environment with memory/CPU limits and network restrictions.
- **Dependencies:** @augure/types, dockerode

### @augure/skills
- **Path:** `packages/skills`
- **Responsibility:** Self-programming system for LLM-generated code units (skills). Implements generate -> test -> heal workflow with YAML frontmatter metadata and skill hub.
- **Dependencies:** @augure/types, gray-matter

### @augure/code-mode
- **Path:** `packages/code-mode`
- **Responsibility:** Code Mode: LLM writes TypeScript that calls tools programmatically instead of one-tool-at-a-time. Three runtimes: vm (fast), docker (sandboxed), auto (vm with docker fallback). Auto-generates typed API from tool registry.
- **Dependencies:** @augure/types, @augure/tools, @augure/sandbox, esbuild

### @augure/core
- **Path:** `packages/core`
- **Responsibility:** Agent orchestrator implementing the core message -> LLM -> tool-call -> execute -> loop cycle. Assembles context from memory, dispatches tool calls through ToolRegistry, routes responses through channels. Includes config loading, LLM client, persona management, approval system, and audit logging.
- **Dependencies:** @augure/types, @augure/browser, @augure/channels, @augure/code-mode, @augure/memory, @augure/sandbox, @augure/scheduler, @augure/skills, @augure/tools

### augure CLI
- **Path:** `packages/cli`
- **Responsibility:** Published npm package (augure). CLI entry point with commands: init, start, --version, --help. Bundled with tsup. Only package published to npm.
- **Dependencies:** @augure/core, citty, @modelcontextprotocol/sdk, dockerode, esbuild, grammy, imapflow, nodemailer, gray-matter, json5, node-cron, zod, @browserbasehq/stagehand

### apps/docs
- **Path:** `apps/docs`
- **Responsibility:** Documentation site built with Fumadocs + Next.js. Published at augure.dev. Independent from the main monorepo dependency graph.

## Conventions

### ESM Import Extensions
- **Description:** All imports must use .js extensions for ESM compatibility, even when importing TypeScript files
- **Scope:** `all source files`
- **Examples:**
  - import { foo } from "./bar.js"
  - export * from "./llm.js"

### Logger Interface Usage
- **Description:** All logging must use the Logger interface from @augure/types. Never use raw console.log/warn/error directly in production code
- **Scope:** `all source files`
- **Examples:**
  - const log = config.logger ?? noopLogger
  - log.info("Message processed")
  - log.child("sandbox") for scoped logging

### No Explicit Any
- **Description:** @typescript-eslint/no-explicit-any is an error. Avoid any type; use proper typing or unknown when necessary
- **Scope:** `all source files`
- **Examples:**
  - // Bad: const x: any
  - // Good: const x: unknown
  - // Good: const x: string | number

### Unused Variable Prefixing
- **Description:** Unused variables and parameters must be prefixed with underscore
- **Scope:** `all source files`
- **Examples:**
  - { argsIgnorePattern: "^_" } in eslint config
  - function(_unused) {}
  - const _temp = value

### Test File Location
- **Description:** Tests live in packages/*/src/__tests__/*.test.ts with vitest (describe/it/expect)
- **Scope:** `testing`
- **Examples:**
  - packages/core/src/__tests__/agent.test.ts
  - import { describe, it, expect, vi } from "vitest"

### Type-first Exports
- **Description:** Export type-only imports using explicit type keyword. Use index.ts as barrel file for clean public API
- **Scope:** `all source files`
- **Examples:**
  - export type { FunctionSchema } from "./registry.js"
  - export { ToolRegistry } from "./registry.js"
  - export * from "./llm.js" in index.ts

### Pre-commit Hooks
- **Description:** Husky pre-commit runs pnpm lint && pnpm typecheck. Pre-push also enforced
- **Scope:** `git workflow`
- **Examples:**
  - prepare: husky in package.json
  - .husky/pre-commit: pnpm lint && pnpm typecheck

### Package Build with TypeScript
- **Description:** Most packages build with tsc (tsc && tsc --watch for dev). CLI package builds with tsup for bundling
- **Scope:** `build configuration`
- **Examples:**
  - "build": "tsc" in package.json
  - "dev": "tsc --watch"
  - CLI: "build": "tsup"

### NativeTool Interface Pattern
- **Description:** Tools implement NativeTool interface with name, description, parameters schema, execute function, optional configCheck and riskLevel
- **Scope:** `tool implementation`
- **Examples:**
  - export const toolName: NativeTool = { name, description, parameters, execute }
  - configCheck returns null when configured, string warning otherwise
  - riskLevel: "high" for approval-gated tools

### Workspace Dependencies
- **Description:** All internal package dependencies use workspace:* protocol in package.json
- **Scope:** `package.json configuration`
- **Examples:**
  - "@augure/types": "workspace:*"
  - "@augure/core": "workspace:*"

### Private Package Flag
- **Description:** All @augure/* packages are private (not published). Only augure CLI package is public
- **Scope:** `package.json configuration`
- **Examples:**
  - "private": true in all @augure/* packages
  - CLI package has publishConfig with access: public

### Turbo Pipeline Dependencies
- **Description:** Build and typecheck tasks declare upstream dependencies with ^. Test tasks depend on build
- **Scope:** `turbo.json configuration`
- **Examples:**
  - "dependsOn": ["^build"] for build task
  - "dependsOn": ["^build"] for typecheck task
  - "dependsOn": ["build"] for test task

## Rules

### @augure/types Zero Dependencies (blocking)
- **Description:** The @augure/types package must not have any dependencies in package.json. It is the base layer that defines shared interfaces and contracts. If types need external dependencies, create a separate types file in the consuming package instead.
- **Scope:** `packages/types/package.json`

### Feature Packages Only Depend on Types (blocking)
- **Description:** Feature packages (@augure/memory, @augure/tools, @augure/browser, @augure/channels, @augure/scheduler, @augure/sandbox, @augure/skills, @augure/code-mode) should only depend on @augure/types and external libraries. They must not import from each other (except tools may import browser for the browser tool). Cross-feature dependencies should go through @augure/core.
- **Scope:** `packages/*/package.json dependencies`

### ESM Import Extensions Required (blocking)
- **Description:** All TypeScript imports must use .js file extensions, even when importing .ts files. This is required for ESM compatibility. Example: import { foo } from "./bar.js" not "./bar" or "./bar.ts".
- **Scope:** `all TypeScript source files`

### No Raw Console Usage (warning)
- **Description:** Production code must use the Logger interface from @augure/types. Never use console.log, console.warn, or console.error directly except in test files or the logger implementation itself (packages/core/src/logger.ts). Always inject a Logger via config or use noopLogger as fallback.
- **Scope:** `packages/*/src/**/*.ts`

### No Explicit Any Type (blocking)
- **Description:** The codebase enforces @typescript-eslint/no-explicit-any as an error. Use proper TypeScript types, generics, or unknown instead of any. This ensures type safety across the monorepo.
- **Scope:** `all TypeScript source files`

### Unused Variables Must Be Prefixed (warning)
- **Description:** Unused parameters and variables must be prefixed with underscore (_) to indicate intentional non-use. ESLint is configured with argsIgnorePattern: "^_" to allow this pattern.
- **Scope:** `all TypeScript source files`

### All Packages Must Have Tests (warning)
- **Description:** Every package must have test files in src/__tests__/*.test.ts using vitest. New features require tests. Test files should use describe/it/expect patterns and mock external dependencies with vi.fn().
- **Scope:** `packages/*`

### Workspace Protocol for Internal Dependencies (blocking)
- **Description:** All internal monorepo dependencies must use the workspace:* protocol in package.json. Never use relative paths like file:../types or version numbers for internal packages. This ensures consistency with pnpm workspaces.
- **Scope:** `packages/*/package.json`

### Tool Implementation Pattern (warning)
- **Description:** NativeTools must implement the NativeTool interface with: name (snake_case), description, parameters (JSON Schema), execute function returning Promise<ToolResult>, optional configCheck for validation warnings, and optional riskLevel: "high" for approval-gated tools. Tools must handle errors gracefully and return {success: false, output: errorMessage} on failure.
- **Scope:** `packages/tools/src/*.ts`

### Type Exports Must Be Explicit (suggestion)
- **Description:** Use explicit type keyword when exporting types (export type { Foo }). For barrel files (index.ts), export implementation members without type keyword and types with type keyword for clarity. This helps with bundler tree-shaking.
- **Scope:** `all TypeScript source files`

### Pre-commit Checks Must Pass (blocking)
- **Description:** All code must pass pnpm lint and pnpm typecheck before being committed. Husky pre-commit hooks enforce this. CI also runs these checks on PRs. Do not bypass with --no-verify.
- **Scope:** `git workflow`

### Private Flag for Internal Packages (blocking)
- **Description:** All @augure/* packages must have "private": true in package.json. Only the augure CLI package should be publishable. The CLI package should have publishConfig.access: public for npm publishing.
- **Scope:** `packages/*/package.json`

### Build Task Dependencies in Turbo (warning)
- **Description:** Build tasks must declare dependsOn: ["^build"] to ensure upstream packages are built first. Typecheck tasks also need upstream builds. Test tasks should depend on ["build"] to ensure the current package is built before testing.
- **Scope:** `turbo.json`

### Tool Names Must Use snake_case (suggestion)
- **Description:** NativeTool names must use snake_case (e.g., web_search, sandbox_exec, memory_read) for consistency with LLM function calling conventions. This makes tools more predictable for both developers and the LLM.
- **Scope:** `packages/tools/src/*.ts`
