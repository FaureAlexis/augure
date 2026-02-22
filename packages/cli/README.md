# augure

A personal AI agent that sees, learns & acts. Deploy in 5 minutes. Own your data.

[![npm version](https://img.shields.io/npm/v/augure?color=%23f59e0b&label=npm&logo=npm&logoColor=white)](https://www.npmjs.com/package/augure)
[![MIT License](https://img.shields.io/github/license/FaureAlexis/augure?color=%23f59e0b)](https://github.com/FaureAlexis/augure/blob/master/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/FaureAlexis/augure/ci.yml?branch=master&label=CI&logo=github)](https://github.com/FaureAlexis/augure/actions)

## Quick Start

```bash
npm install -g augure
augure init        # generates augure.json5 + .env
augure start       # start the agent
```

Or with Docker Compose:

```bash
git clone https://github.com/FaureAlexis/augure.git && cd augure
cp .env.example .env
cp config/augure.example.json5 config/augure.json5
docker compose up -d
```

## What is Augure?

Augure is an open-source AI agent built on six primitives: **think, execute, remember, communicate, watch, learn**. It runs 24/7 on your server, connects to your messaging apps, learns your preferences, and acts proactively on a schedule.

- **Filesystem-first** — Memory, config, logs: everything is human-readable files. No vector DB.
- **Proactive** — Cron jobs, heartbeat monitoring, and actions on your behalf 24/7.
- **Secure by default** — All execution in Docker containers. Credentials never touch disk.
- **Self-improving** — Generates reusable skills, tests them, and auto-heals on failure.
- **Cost-aware** — Per-usage model routing. Cheap models for monitoring, full models for reasoning.
- **Readable** — Under 5K lines of source code.

## Commands

| Command | Description |
|---------|-------------|
| `augure init` | Generate `augure.json5` and `.env` templates |
| `augure start` | Start the agent |
| `augure start --config path/to/config.json5` | Start with a custom config path |
| `augure --version` | Print version |
| `augure --help` | Show help |

## Configuration

`augure init` generates two files:

- **`augure.json5`** — Agent config: identity, LLM provider, channels, memory, scheduler, tools, sandbox, skills, security
- **`.env`** — API keys (`OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`)

## Documentation

Full docs at **[augure.dev](https://augure.dev)**

## License

[MIT](https://github.com/FaureAlexis/augure/blob/master/LICENSE)
