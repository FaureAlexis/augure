---
"augure": minor
"@augure/core": minor
"@augure/types": minor
---

Add CLI subcommands and MCP server

**CLI:**
- `augure stop` — graceful daemon shutdown via PID file
- `augure status` — read-only overview (PID, config, memory, jobs, channels, Docker, skills)
- `augure doctor` — validate config, Docker, LLM, and Telegram connectivity
- `augure memory list|show|edit` — inspect and edit memory files
- `augure jobs list|add|remove|run` — manage scheduled jobs
- `augure channels status` — check channel connectivity
- `augure tools list|test` — inspect and test registered tools
- `augure mcp` — standalone MCP server (stdio transport)
- `augure start --daemon` — run agent as background daemon with PID file
- `augure start --mcp` — enable MCP HTTP server alongside the agent

**MCP Server:**
- Tool bridge: all registered Augure tools exposed as MCP tools (including browser and skill tools)
- Resources: memory files (`memory://`) and scheduled jobs (`jobs://`)
- Prompts: persona system exposed as MCP prompts
- Transports: stdio (for Claude Desktop/Cursor) and HTTP (StreamableHTTP on configurable port)
- Path traversal protection on memory resource reads

**Types:**
- Added `McpConfig` interface (`enabled`, `port`)
- Added `mcp?` field to `AppConfig`
