---
"@augure/types": minor
"@augure/tools": minor
"@augure/core": minor
---

Add datetime tool, configCheck warnings, and enriched system prompt

- New `datetime` tool returns current date/time with optional IANA timezone support
- `NativeTool` gains an optional `configCheck` field: unconfigured tools show a `[NOT CONFIGURED]` warning with a documentation link in their LLM description
- `assembleContext` now injects the current date and time into every LLM system prompt
- The system prompt describes available tools and the skills system (conditional on config)
- `emailTool` is now registered by default (was exported but never wired up)
- Structured logging via `Logger` interface with `--debug` CLI flag
