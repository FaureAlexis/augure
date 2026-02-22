<p align="center">
  <img src="apps/docs/public/readme-header.png" alt="augure" width="100%" />
</p>

<p align="center">
  <em>A personal AI agent that sees, learns & acts. Deploy in 5 minutes. Own your data.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/augure"><img src="https://img.shields.io/npm/v/augure?color=%23f59e0b&label=npm&logo=npm&logoColor=white" alt="npm version" /></a>
  <a href="https://github.com/FaureAlexis/augure/blob/master/LICENSE"><img src="https://img.shields.io/github/license/FaureAlexis/augure?color=%23f59e0b" alt="MIT License" /></a>
  <a href="https://github.com/FaureAlexis/augure/actions"><img src="https://img.shields.io/github/actions/workflow/status/FaureAlexis/augure/ci.yml?branch=master&label=CI&logo=github" alt="CI" /></a>
  <a href="https://augure.dev"><img src="https://img.shields.io/badge/docs-augure.dev-%23f59e0b?logo=readthedocs&logoColor=white" alt="Docs" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-green?logo=node.js&logoColor=white" alt="Node.js >= 22" /></a>
</p>

---

## What is Augure?

Augure is an open-source AI agent built on six primitives: **think, execute, remember, communicate, watch, learn**. It runs 24/7 on your server, connects to your messaging apps, learns your preferences, and acts proactively on a schedule.

The name comes from Latin *augur* — the Roman priest who read the flight of birds to predict the future.

## Quick Start

### Via npm

```bash
npm install -g augure
augure init        # generates augure.json5 + .env
augure start       # start the agent
```

### Via Docker Compose

```bash
git clone https://github.com/FaureAlexis/augure.git && cd augure
cp .env.example .env          # add your API keys
cp config/augure.example.json5 config/augure.json5
docker compose up -d
```

Talk to your bot on Telegram. No ports to open — the agent uses outbound polling only.

## Core Principles

- **Filesystem-first** — Memory, config, logs: everything is human-readable files. No vector DB, no opaque stores.
- **Proactive** — Not just reactive chat. Cron jobs, heartbeat monitoring, and actions on your behalf 24/7.
- **Secure by default** — All execution in Docker containers. Credentials never touch disk.
- **Self-improving** — Extracts observations from conversations. Generates reusable skills, tests them, and auto-heals on failure.
- **Cost-aware** — Per-usage model routing. Cheap models for monitoring, full models for reasoning.
- **Readable** — Under 10K lines. A single developer can audit the entire codebase in an afternoon.

## Architecture

Augure is a pnpm monorepo. Only the `augure` CLI is published to npm — all other packages are private workspace dependencies.

```
packages/
  cli/        → published as `augure` on npm
  core/       → agent loop, LLM client, config loader
  types/      → shared TypeScript interfaces
  channels/   → Telegram (more channels planned)
  memory/     → persistent memory store, ingestion, retrieval
  scheduler/  → cron jobs, heartbeat
  tools/      → tool registry (memory, schedule, web_search, http, sandbox_exec, opencode)
  sandbox/    → Docker container pool with idle caching and trust-level isolation
  skills/     → self-generated skills: LLM generation, sandbox testing, auto-healing, hub
apps/
  docs/       → documentation site (Fumadocs + Next.js) — augure.dev
```

## Commands

| Command | Description |
|---------|-------------|
| `augure init` | Generate `augure.json5` and `.env` templates |
| `augure start` | Start the agent (reads `./augure.json5` by default) |
| `augure start --config path/to/config.json5` | Start with a custom config path |
| `augure --version` | Print version |
| `augure --help` | Show help |

## Configuration

`augure init` generates two files:

- **`augure.json5`** — Agent config: identity, LLM provider, channels, memory, scheduler, tools, sandbox, skills, security
- **`.env`** — API keys (`OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`)

See the full [Configuration Reference](https://augure.dev/docs/configuration) for every option.

## Documentation

Full docs at **[augure.dev](https://augure.dev)**:

- [Getting Started](https://augure.dev/docs) — quick setup guide
- [Architecture](https://augure.dev/docs/architecture) — primitives, packages, execution flow
- [Memory System](https://augure.dev/docs/memory) — how Augure learns and remembers
- [Skills System](https://augure.dev/docs/skills) — self-generated skills with auto-healing
- [Scheduler](https://augure.dev/docs/scheduler) — cron jobs and proactive heartbeat
- [Tools](https://augure.dev/docs/tools) — native tools available to the agent
- [Deployment](https://augure.dev/docs/deployment) — production setup and security

## Development

```bash
pnpm install       # install dependencies
pnpm build         # build all packages
pnpm test          # run tests
pnpm lint          # lint
pnpm typecheck     # typecheck
```

### Release Process

Augure uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
pnpm changeset                       # describe the change
# Push to master → GitHub Actions opens a "Version Packages" PR
# Merge that PR → npm publish + GitHub Release + git tag
```

## License

[MIT](LICENSE)
