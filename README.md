# Augure

A proactive AI assistant with persistent memory, scheduled tasks, and multi-channel communication.

## Install

```bash
npm install -g augure
```

Requires Node.js >= 22.

## Quick Start

```bash
# Generate config files
augure init

# Edit your config and API keys
vim augure.json5
vim .env

# Start the agent
augure start
```

## Commands

| Command | Description |
|---------|-------------|
| `augure init` | Create `augure.json5` and `.env` templates in the current directory |
| `augure start` | Start the agent (reads `./augure.json5` by default) |
| `augure start --config path/to/config.json5` | Start with a custom config path |
| `augure --version` | Print the installed version |
| `augure --help` | Show help |

## Configuration

`augure init` generates two files:

- **`augure.json5`** — Agent configuration (identity, LLM provider, channels, memory, scheduler, tools, security)
- **`.env`** — API keys (`OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`)

## Architecture

Augure is a pnpm monorepo. Only the `augure` package is published to npm — all internal packages are private workspace dependencies.

```
packages/
  cli/        → published as `augure` on npm
  core/       → agent loop, LLM client, config loader
  types/      → shared TypeScript types
  channels/   → Telegram (more channels planned)
  memory/     → persistent memory store, ingestion, retrieval
  scheduler/  → cron jobs, heartbeat
  tools/      → tool registry (memory, schedule, http, web search)
  sandbox/    → sandboxed code execution (stub)
  skills/     → skill system (stub)
```

## Docker

Alternatively, run via Docker:

```bash
docker build -t augure .
docker run -v $(pwd)/config:/app/config --env-file .env augure
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint & typecheck
pnpm lint
pnpm typecheck
```

### Release Process

Augure uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# After making changes, describe the change
pnpm changeset

# Push to master → GitHub Actions opens a "Version Packages" PR
# Merge that PR → npm publish + GitHub Release + git tag
```

**Beta releases:**

```bash
pnpm changeset pre enter beta    # Enter pre-release mode
# ... merge PRs normally → publishes augure@x.y.z-beta.N
pnpm changeset pre exit          # Exit pre-release mode
# ... next publish → stable release
```

## License

MIT
