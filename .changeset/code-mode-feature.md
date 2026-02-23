---
"@augure/types": minor
"@augure/core": minor
---

Add code mode — replace N-tool function-calling loop with single TypeScript execution

- New `@augure/code-mode` package: LLM writes TypeScript that calls typed APIs in a sandbox instead of making individual tool calls
- Typegen: auto-generates TypeScript declarations from ToolRegistry for the LLM system prompt
- Bridge: Proxy-based `api.*` object routes calls from sandbox back to host ToolRegistry
- VM executor: fast default using Node's built-in `vm` module + esbuild transpilation
- Docker executor: container-based sandbox following SkillRunner pattern
- AutoExecutor: VM-first with Docker fallback on executor crash
- New `CodeModeConfig` in types (`runtime: "vm" | "docker" | "auto"`, `timeout`, `memoryLimit`)
- Agent loop uses single `execute_code` tool when code mode is enabled, falls back to classic tool loop otherwise
