# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm build                # Build all packages (turbo, respects dependency graph)
pnpm dev                  # Watch mode for all packages
pnpm test                 # Run all tests (requires build first)
pnpm test:unit            # Run unit tests only (no build dependency)
pnpm lint                 # ESLint across all packages
pnpm typecheck            # TypeScript type checking (requires upstream builds)
pnpm clean                # Remove dist/ and .turbo/ in all packages

# Single package
pnpm --filter @augure/core test        # Run tests for one package
pnpm --filter @augure/core build       # Build one package
pnpm --filter @augure/tools typecheck  # Typecheck one package

# Single test file (run from package directory)
cd packages/core && npx vitest run src/__tests__/agent.test.ts

# Releases (changesets)
pnpm changeset            # Create a changeset describing your change
pnpm version-packages     # Apply changesets to bump versions
pnpm release              # Publish to npm
```

## Architecture

**Monorepo**: pnpm workspaces + Turborepo. ESM-only (`"type": "module"`), TypeScript 5.9+, Node 22+.

### Package Dependency Graph

```
@augure/types (zero deps — shared interfaces/contracts)
    ↑
    ├── @augure/memory     (file-based store + LLM ingestion/retrieval)
    ├── @augure/tools      (NativeTool registry + 9 built-in tools)
    ├── @augure/channels   (Telegram via grammY, middleware pipeline)
    ├── @augure/scheduler  (node-cron + heartbeat + job persistence)
    ├── @augure/sandbox    (Docker container pool with trust levels)
    ├── @augure/skills     (self-programming: generate → test → heal)
    ↑
    └── @augure/core       (Agent orchestrator — depends on all above)
            ↑
            └── augure (CLI) — published npm package, bundles with tsup
```

`apps/docs` — Fumadocs + Next.js documentation site (independent).

### Core Loop

The Agent (`packages/core/src/agent.ts`) runs a message → LLM → tool-call → execute → loop cycle. It assembles context from memory retrieval, dispatches tool calls through the ToolRegistry, and routes responses back through channels. The scheduler drives proactive behavior via cron jobs and heartbeats.

### Key Patterns

- **Interface-first**: `@augure/types` defines all contracts (LLMClient, Message, ToolCall, config schemas). Implementations live in their respective packages.
- **Filesystem-first**: Memory, jobs, audit logs, and skills all persist as files — no database.
- **Config via `augure.json5`**: Supports `${ENV_VAR}` interpolation, validated with Zod. Multi-model LLM routing (default/reasoning/ingestion/monitoring/coding).
- **Docker sandboxing**: Code execution isolated in containers with trust levels, memory/CPU limits, network restrictions.
- **Skills system**: LLM-generated code units with YAML frontmatter, auto-tested in sandbox, self-healing on failure.
- **Structured logging**: `Logger` interface in `@augure/types` with `noopLogger` default. `createLogger()` in `@augure/core` produces colored, leveled output (`▲ HH:MM:SS.mmm LVL scope`). Subsystems receive child loggers via DI (`log.child("sandbox")`). Use `augure start --debug` for debug-level output.

## Code Conventions

- All imports use `.js` extensions (ESM requirement): `import { foo } from "./bar.js"`
- Tests live in `packages/*/src/__tests__/*.test.ts` (vitest with describe/it/expect)
- Most packages build with `tsc`; the CLI (`augure`) builds with `tsup`
- Use the `Logger` interface from `@augure/types` for logging — never use raw `console.log/warn/error`
- `@typescript-eslint/no-explicit-any` is an error — avoid `any`
- Unused variables must be prefixed with `_`
- Pre-commit hook runs `pnpm lint && pnpm typecheck`
- Only the `augure` CLI package is published to npm; all `@augure/*` packages are `private: true`
