# Augure — Always-on AI Agent

> *"Augure"* — French/Latin for "oracle, the one who foresees." A lightweight, self-hosted AI agent that runs 24/7 on a VPS. Proactive, personal, extensible. MIT Licensed.

## Vision

Augure is an open-source personal AI agent designed to run continuously on a server. Unlike OpenClaw's monolithic 430K+ LOC codebase, Augure is built to be understood, audited, and extended by a single developer in an afternoon.

The agent connects to your messaging apps, learns your preferences over time, executes tasks proactively on a schedule, and can spin up isolated sandboxes for heavy work like coding or browser automation.

**Core principles:**

- **Filesystem-first** — Memory, skills, config, logs: everything is files. Human-readable, git-trackable, greppable. No vector DB, no embeddings, no opaque stores.
- **Readable** — Target <10K LOC. A single developer should be able to audit the entire codebase in an afternoon.
- **Secure by default** — All execution in Docker containers. Trust levels. Tiered approval. No marketplace. Credentials never touch disk.
- **Proactive** — Not just reactive chat; schedules, monitors, and acts on your behalf 24/7.
- **Cost-aware** — Per-usage model routing. Cheap models for monitoring, full models for reasoning. Daily spend limits.
- **Self-improving** — The agent writes, tests, deploys, and self-heals its own skills.

---

## Philosophy: Why Augure Exists

### The State of Personal AI Agents (Feb 2026)

OpenClaw proved the concept. 175K+ GitHub stars, 300K+ users — the demand for "an AI that actually does things" is real. But the execution is a cautionary tale:

- **Security nightmare.** Cisco, CrowdStrike, and Conscia all published critical assessments. CVE-2026-25253 (CVSS 8.8) enabled one-click RCE. The ClawHavoc campaign poisoned 20% of ClawHub skills with malware. 30,000+ instances found exposed on the internet without authentication.
- **Complexity without clarity.** 430K+ LOC, 52 modules, 45 dependencies, 15 channel abstractions. As NanoClaw's creator said: "I cannot sleep peacefully when running software I don't understand and that has access to my life."
- **Vibed into existence.** Three name changes in two months. The GitHub README says "AI/vibe-coded PRs welcome!" — which is how malicious skills slipped through undetected.
- **No governance model.** Credentials stored in plaintext, no origin validation on WebSockets, an open marketplace with zero vetting.

Meanwhile, the industry is converging on several truths about what actually works:

### Design Principles

#### 1. Filesystem > RAG (for personal agents)

LlamaIndex's 2026 benchmarks show filesystem-based agents **outperform RAG** on correctness (8.4 vs 6.4) and relevance (9.6 vs 8.0). The reason is simple: LLMs were trained on billions of files. They know `cat`, `grep`, `ls`. They don't know your vector DB's query language.

Arize's engineering team confirmed the same insight: "Filesystem wins by default because the education already happened during pretraining." The "virtual filesystem" pattern is emerging as best practice — the agent sees files, but the storage layer underneath can be anything.

**Augure's approach:** Memory is markdown files on disk. Skills are markdown + TypeScript files. Config is JSON5. Everything is human-readable, git-trackable, and greppable. No vector database, no embeddings, no chunking pipeline. The LLM reads files directly.

This isn't a compromise — it's a **feature**. Markdown files mean:
- Users can inspect and edit memory with any text editor
- `git diff` shows exactly what changed
- Backup is `cp -r memory/ /backup/`
- No database to crash, corrupt, or migrate
- The agent can read its own memory the same way it reads any file

#### 2. Observational Memory > Retrieval Memory

Mastra's "observational memory" architecture (scoring 94.87% on LongMemEval) validates a key insight: for personal agents, it's better to **compress what happened** than to **search for what might be relevant**.

Traditional RAG retrieves chunks dynamically each turn, which:
- Invalidates prompt cache (costs 4-10x more)
- Introduces retrieval latency
- Can miss context or retrieve irrelevant chunks
- Requires complex pipeline (embed → store → query → rerank)

Observational memory keeps a stable, compressed observation log in context. It's append-only between reflection passes, enabling aggressive prompt caching.

**Augure's approach:** Memory ingestion extracts key observations from conversations using a cheap model (Gemini Flash). These observations are stored as dated markdown entries. The agent's context is assembled from: system prompt + memory observations + conversation history. The memory block is stable between ingestion runs, enabling provider cache hits.

#### 3. Simplicity is Security

The #1 lesson from the OpenClaw crisis: complexity is the enemy of security. Every abstraction layer is an attack surface. Every dependency is a supply chain risk.

The "Lethal Trifecta" (Simon Willison / OWASP 2026) defines the danger zone:
1. Access to private data
2. Exposure to untrusted tokens (emails, web pages)
3. Exfiltration vector (can send data out)

If your agent has all three simultaneously, it's vulnerable to prompt injection. Period.

**Augure's approach:**
- **Container isolation by default.** OpenCode runs in Docker, not on the host. A compromised skill can't touch your filesystem.
- **Trust levels.** `sandboxed` (default) = no host network, scoped volume only. `trusted` = explicit opt-in for skills that need host access.
- **Tiered approval.** Read-only operations proceed automatically. Write operations to external systems require confirmation via messaging channel. Destructive operations require explicit "yes" response.
- **No marketplace.** Skills are generated by your agent or written by you. No ClawHub-style registry where anyone can push malware. Community sharing is P2 with manual review.
- **Readable codebase.** A single developer should be able to audit the entire project. If you can't understand what your agent does, you shouldn't run it.

#### 4. Native Tools for Speed, OpenCode for Everything Else

The industry debate of "filesystem vs API vs database" misses the point. The real question is: **what's the fastest path from intent to execution?**

Most agent requests fall into two categories:
- **Frequent, lightweight ops** (search, read memory, set schedule) → Run in-process, no container overhead
- **Complex, unpredictable tasks** (scrape a website, analyze data, write code, interact with an API) → Delegate to OpenCode in a sandboxed container

This hybrid model means:
- 80% of interactions are instant (native tools)
- 20% that need real execution get a full environment (OpenCode)
- No need to code a separate tool for every API — OpenCode writes the script on the fly

#### 5. Skills That Write Themselves (And Fix Themselves)

Every existing agent framework requires you to write integrations. Augure's killer insight: **the agent should write its own integrations**.

You say "surveille les apparts meublés Bordeaux < 1100€ sur SeLoger et LeBonCoin, rapport chaque matin" and the agent:
1. Generates a skill (markdown spec + TypeScript code)
2. Tests it in a sandbox
3. Deploys it on a cron schedule
4. Monitors execution logs
5. Self-heals when the site changes DOM structure

This is what ai.com calls "autonomously building out missing features" — except it's local, private, and you can read every line of generated code.

#### 6. Cost-Aware by Design

Running a personal agent 24/7 can get expensive fast. Augure uses **per-usage model routing**:

| Usage | Model | Why |
|-------|-------|-----|
| Conversation | Claude Sonnet 4.5 | Best reasoning for user-facing interactions |
| Memory ingestion | Gemini Flash | Cheap, fast, good enough for extracting facts |
| Heartbeat monitoring | Gemini Flash | Lightweight checks, $0.001/check |
| Skill generation | Claude Sonnet 4.5 | Needs strong coding ability |
| Skill self-healing | Claude Sonnet 4.5 | Needs to debug and patch code |

This means the agent can run 24/7 heartbeat checks for pennies, only spinning up expensive models when real reasoning is needed.

### How Augure Compares

| | OpenClaw | NanoClaw | Augure |
|---|---------|----------|--------|
| **LOC** | 430K+ | ~2K | Target <10K |
| **License** | MIT | MIT | MIT |
| **Memory** | Markdown files | Markdown files | Markdown files (+ observational compression) |
| **Sandbox** | Opt-in, app-level | Container per group | Container pool, trust levels |
| **Skills** | ClawHub registry (20% malware) | None | Self-generated, no marketplace |
| **Security model** | Allowlists + pairing codes | Container isolation | Container isolation + tiered approval + trust levels |
| **Channels** | 15+ | WhatsApp only | Telegram (v0) → WhatsApp → Web |
| **Proactivity** | Heartbeat daemon | None | Cron + heartbeat + skills scheduler |
| **Self-healing** | No | No | Yes (skill auto-repair) |
| **Codebase** | "Vibe-coded", hard to audit | Minimal, auditable | Modular monorepo, fully typed |
| **Cost control** | Single model | Single model | Per-usage model routing |

### What We're NOT Building

- **Not an enterprise platform.** No RBAC, no multi-tenant, no compliance frameworks. Augure is for one person.
- **Not a framework.** You don't import Augure as a library. You deploy it as a service.
- **Not a marketplace.** No community skill registry in V0. Your agent writes its own skills.
- **Not a local-only tool.** Augure is designed to run 24/7 on a VPS, not on your laptop.

---

## Gap Analysis: What Could Be Missing

Based on the current landscape and OpenClaw post-mortems, here are risks and gaps to address:

### Must Address (Before M0)

| Gap | Risk | Mitigation |
|-----|------|-----------|
| **Prompt injection via ingested content** | Agent reads a malicious email/webpage that hijacks its behavior | Separate "reading" context from "acting" context. Never execute tool calls based on untrusted content without user confirmation. Apply the "Rule of Two" — never allow all three of: private data access + untrusted tokens + exfiltration in the same session. |
| **Credential management** | API keys in plaintext config files (OpenClaw's exact failure) | Environment variable interpolation in config. Secrets never written to disk in cleartext. Container env injection at runtime only. |
| **Audit trail / observability** | Can't tell what the agent did, when, and why | Every action logged with timestamp, trigger (user/cron/heartbeat), tool used, LLM reasoning trace, and outcome. Logs stored as append-only JSONL files. |
| **Kill switch** | Agent goes rogue on a cron job at 3am | Global pause via Telegram command (`/pause`). Per-skill pause. Max daily spend limit on LLM calls. Container timeout hard limit. |

### Should Address (M1-M2)

| Gap | Description |
|-----|-------------|
| **Memory temporal awareness** | Current memory has no concept of "this fact supersedes that one." Need dated observations so the agent knows "moved to Paris in Jan 2026" overrides "lives in Bordeaux." |
| **Memory reflection / compaction** | Inspired by Mastra's Reflector agent — periodically re-read all memory, merge duplicates, remove contradictions, compress. |
| **Action confirmation UX** | Tiered approval via Telegram: inline buttons for approve/deny. Preview of what the action will do (diff-style for file changes, full text for emails). |
| **Rate limiting / cost guardrails** | Daily LLM budget cap. Per-skill token budget. Alert when approaching limit. Automatic fallback to cheaper model. |
| **Structured output for skills** | Skills that return data (not just reports) should output structured JSON that other skills can consume. Enable skill-to-skill data flow. |

### Nice to Have (P2+)

| Gap | Description |
|-----|-------------|
| **Multi-modal input** | Voice messages, images, PDFs via Telegram. Agent can process them via OpenCode. |
| **Agent-to-agent protocol** | If Augure instances could communicate (e.g., your agent asks a friend's agent for restaurant recs). Very experimental. |
| **Virtual filesystem pattern** | Expose external data (APIs, databases) as virtual files to the agent at runtime. Best of both worlds: filesystem interface, remote data. |
| **Offline / local model fallback** | If OpenRouter is down or budget is exhausted, fall back to a local Ollama model for basic interactions. |
| **MCP server compatibility** | Expose Augure's capabilities as an MCP server so it can be used by Claude Desktop, Cursor, etc. |

---

## Target Users

**V0:** Developer-friendly self-hosters (deploy on a VPS via Docker Compose)
**V1:** Non-technical users via managed hosting with a web dashboard

---

## Use Cases (Priority Order)

### P0 — MVP

1. **Chat via Telegram** — Conversational AI assistant accessible from your phone
2. **Proactive scheduled tasks (Cron/Heartbeat)** — "Every morning at 8h, check new apartment listings on SeLoger for Bordeaux < 1100€ meublé and send me a report"
3. **Browser automation** — Agent can navigate websites, scrape data, fill forms via Playwright in a sandboxed container
4. **Persistent memory** — Agent remembers your preferences, context, ongoing tasks across sessions
5. **Basic email monitoring** — Connect via IMAP, alert on important emails matching rules

### P1 — Post-MVP

6. **Coding agent** — "Fix this bug on repo X, make a PR" → spins up OpenCode/Aider in a sandbox with repo access
7. **WhatsApp channel** — Add WhatsApp via Baileys as second messaging channel
8. **Stock/crypto monitoring** — Daily portfolio report, price alerts
9. **GitHub integration** — PR reviews, issue triage, release monitoring
10. **Life advisor mode** — Tax reminders, career advice based on accumulated personal context

### P2 — Future

11. **Web dashboard** — Real-time chat UI, task management, memory viewer, config editor
12. **Multi-agent** — Spin up specialized sub-agents for complex tasks
13. **Managed hosting** — One-click deploy for non-technical users
14. **Voice** — Voice messages in/out via Telegram/WhatsApp

---

## Primitives

Augure is built on 6 core primitives — the irreducible building blocks of the agent:

```
┌─────────────────────────────────────────────────────────────────┐
│                         AUGURE                                   │
│                                                                  │
│  🧠 THINK        Reason, plan, decide         (LLM via OR)      │
│  🤲 EXECUTE      Act on the world              (OpenCode)        │
│  💾 REMEMBER     Persistent context             (Markdown fs)    │
│  📡 COMMUNICATE  Talk to the user               (Channels)       │
│  👁️  WATCH        Monitor & trigger proactively  (Scheduler)      │
│  🧬 LEARN        Teach itself new capabilities  (Skills)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Primitive | Package | What it does |
|-----------|---------|-------------|
| **THINK** | `@augure/core` | LLM orchestration via OpenRouter. Context assembly (memory + conversation + tool results). Decides which tools/skills to invoke. |
| **EXECUTE** | `@augure/sandbox` | OpenCode as the universal executor. Runs shell, browser, curl, Python, TS — anything. Sandboxed Docker containers with a warm pool. Native tools (search, memory) handle frequent lightweight ops directly. |
| **REMEMBER** | `@augure/memory` | Markdown files on disk. Ingests facts from conversations. Retrieves relevant context. User-inspectable and editable. |
| **COMMUNICATE** | `@augure/channels` | Telegram (v0), WhatsApp (P1), Web (P2). Bidirectional — receives messages AND pushes proactive reports. |
| **WATCH** | `@augure/scheduler` | Cron jobs, heartbeat, event monitoring. Triggers skills on schedule or on conditions. Dual-mode: cheap model for monitoring, full model when action needed. |
| **LEARN** | `@augure/skills` | Self-generates skills (markdown + TS). Tests in sandbox. Deploys to scheduler. Self-heals on failure. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     📡 COMMUNICATE                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐        │
│  │ Telegram  │  │ WhatsApp  │  │ Web Dashboard API │        │
│  │ (grammy)  │  │ (Baileys) │  │    (REST + WS)    │        │
│  └─────┬─────┘  └─────┬─────┘  └────────┬──────────┘        │
│        └───────────────┼─────────────────┘                   │
│                        ▼                                     │
│              ┌─────────────────┐                             │
│              │  Message Router  │                             │
│              └────────┬────────┘                             │
│                       ▼                                      │
├──────────────────────────────────────────────────────────────┤
│                   🧠 THINK                                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              Orchestrator                            │     │
│  │  - LLM calls (OpenRouter, per-usage model config)   │     │
│  │  - Context assembly (memory + conversation)         │     │
│  │  - Decision: native tool vs OpenCode vs skill       │     │
│  │  - Conversation management                          │     │
│  └──────┬──────────┬──────────┬──────────┬─────────────┘     │
│         ▼          ▼          ▼          ▼                    │
│  ┌───────────┐ ┌────────┐ ┌────────┐ ┌──────────┐           │
│  │💾 REMEMBER│ │👁️ WATCH │ │🧬 LEARN│ │🤲 EXECUTE│           │
│  │  Memory   │ │Scheduler│ │ Skills │ │          │           │
│  │  Store    │ │  Cron   │ │ Engine │ │  Native  │           │
│  │ (md fs)   │ │Heartbeat│ │ Gen    │ │  Tools   │           │
│  │           │ │  Jobs   │ │ Test   │ │ (search, │           │
│  │           │ │         │ │ Heal   │ │  memory, │           │
│  │           │ │         │ │ Run    │ │  http)   │           │
│  └───────────┘ └────────┘ └────────┘ └────┬─────┘           │
│                                           │                  │
│              Fallback: no native tool?    │                  │
│                         ┌─────────────────┘                  │
│                         ▼                                    │
├──────────────────────────────────────────────────────────────┤
│                   🤲 EXECUTE (OpenCode)                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Container Pool Manager                   │    │
│  │  - Warm pool of ready containers                      │    │
│  │  - Acquire → use → release (or recycle)               │    │
│  │  - Per-skill trust level (sandboxed vs trusted)       │    │
│  │  - Volume mounts (scoped per task)                    │    │
│  │  - Timeout & resource limits                          │    │
│  │  - Output capture & streaming to channel              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  OpenCode    │  │  OpenCode    │  │  OpenCode    │       │
│  │  (warm) 🟢   │  │  (warm) 🟢   │  │  (idle) 🟡   │       │
│  │              │  │              │  │              │       │
│  │  Can do:     │  │  Can do:     │  │  Preloaded:  │       │
│  │  - shell     │  │  - browser   │  │  - node 22   │       │
│  │  - curl      │  │  - playwright│  │  - python3   │       │
│  │  - python    │  │  - scraping  │  │  - gh cli    │       │
│  │  - node/ts   │  │  - forms     │  │  - playwright│       │
│  │  - git       │  │  - downloads │  │  - curl/jq   │       │
│  │  - gh cli    │  │              │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Execution Flow: Native Tools vs OpenCode

```
User request arrives
       │
       ▼
  ┌─────────────┐     YES     ┌───────────────────┐
  │ Has native   │───────────→│ Execute native tool │
  │ tool?        │            │ (fast, no container)│
  │ search/mem/  │            └───────────────────┘
  │ schedule/http│
  └──────┬──────┘
         │ NO
         ▼
  ┌──────────────┐            ┌───────────────────┐
  │ Acquire warm │───────────→│ OpenCode executes  │
  │ container    │            │ in sandbox         │
  │ from pool    │            │ (shell/browser/    │
  └──────────────┘            │  python/curl/etc)  │
                              └────────┬──────────┘
                                       │
                              ┌────────▼──────────┐
                              │ Return to pool     │
                              │ or destroy if      │
                              │ tainted            │
                              └───────────────────┘
```

### Native Tools (lightweight, no container)

These run in-process for speed. They handle the most frequent operations:

| Tool | Why native | What it does |
|------|-----------|-------------|
| `web_search` | Latency-sensitive, simple API call | Tavily/SearXNG query |
| `memory_read` | Filesystem read, no isolation needed | Read memory/*.md files |
| `memory_write` | Filesystem write, no isolation needed | Update memory files |
| `schedule` | Internal state, no execution | Create/update/delete cron jobs |
| `http` | Simple fetch, no DOM needed | GET/POST API calls with auth |
| `skill_run` | Orchestration, delegates to sandbox | Trigger a skill execution |

### OpenCode (universal executor, sandboxed)

Everything else goes through OpenCode in a container. The LLM describes what it needs, OpenCode figures out how:

- **Shell**: `curl`, `jq`, `grep`, `awk`, file manipulation
- **Browser**: Playwright for scraping, form filling, screenshots
- **Python**: Data analysis, pandas, API integrations, scripts
- **Node/TS**: Complex logic, API orchestrations
- **Git/GitHub**: Clone, branch, commit, PR via `gh` CLI
- **Any CLI tool**: Installed in the container image

### Container Pool

```typescript
interface ContainerPool {
  // Pool config
  minWarm: number;          // Min containers kept warm (default: 2)
  maxTotal: number;         // Max concurrent containers (default: 5)
  idleTimeout: number;      // Recycle idle containers after N minutes (default: 10)
  
  // Lifecycle
  acquire(opts: ContainerOpts): Promise<Container>;  // Get a warm container
  release(container: Container): Promise<void>;       // Return to pool
  destroy(container: Container): Promise<void>;       // Kill if tainted
  
  // Health
  warmCount(): number;
  activeCount(): number;
  stats(): PoolStats;
}

interface ContainerOpts {
  trust: 'sandboxed' | 'trusted';  // Trusted = can access host network/volumes
  timeout: number;                  // Max execution time
  memory: string;                   // Memory limit (e.g., '512m')
  mounts?: VolumeMount[];           // Additional volume mounts
  env?: Record<string, string>;     // Environment variables (API keys, etc.)
}
```

### Trust Levels

| Level | Network | Filesystem | Use case |
|-------|---------|-----------|----------|
| `sandboxed` (default) | Isolated | Scoped volume only | Unknown skills, web scraping, untrusted code |
| `trusted` | Host network | Can mount host paths | Personal skills, git repos, email access |

Trust is configured per-skill in `skill.md` frontmatter:
```yaml
sandbox: true          # sandboxed (default)
sandbox: false         # trusted
```

---

## Package Structure (Monorepo)

```
augure/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml            # Main deployment
├── Dockerfile                    # Agent container
│
├── packages/
│   ├── core/                     # Agent orchestrator, LLM client, tool dispatch
│   │   ├── src/
│   │   │   ├── agent.ts          # Main agent loop
│   │   │   ├── llm.ts            # OpenRouter / provider abstraction
│   │   │   ├── tools.ts          # Tool registry & dispatch
│   │   │   ├── context.ts        # Context window assembly
│   │   │   └── config.ts         # Config loader (JSON5)
│   │   └── package.json
│   │
│   ├── memory/                   # Persistent memory (markdown files)
│   │   ├── src/
│   │   │   ├── store.ts          # Read/write memory files
│   │   │   ├── ingest.ts         # Extract facts from conversations
│   │   │   ├── retrieve.ts       # Relevant memory retrieval for context
│   │   │   └── proactive.ts      # Intent prediction from memory patterns
│   │   └── package.json
│   │
│   ├── scheduler/                # Cron jobs & heartbeat
│   │   ├── src/
│   │   │   ├── cron.ts           # node-cron wrapper
│   │   │   ├── jobs.ts           # Job definitions & persistence
│   │   │   └── heartbeat.ts      # Periodic proactive check-ins
│   │   └── package.json
│   │
│   ├── skills/                   # Skill system (self-learning)
│   │   ├── src/
│   │   │   ├── manager.ts        # Skill lifecycle (create, test, deploy, heal)
│   │   │   ├── generator.ts      # LLM-powered skill code generation
│   │   │   ├── tester.ts         # Auto-test skills in sandbox
│   │   │   ├── healer.ts         # Self-healing on failure
│   │   │   ├── runner.ts         # Execute skills with context
│   │   │   ├── context.ts        # SkillContext API
│   │   │   └── types.ts          # Skill interfaces & schemas
│   │   └── package.json
│   │
│   ├── sandbox/                  # Container pool management
│   │   ├── src/
│   │   │   ├── pool.ts           # Container pool (warm, acquire, release)
│   │   │   ├── container.ts      # Container lifecycle & exec
│   │   │   ├── opencode.ts       # OpenCode bridge (task → container)
│   │   │   └── types.ts          # ContainerOpts, TrustLevel, etc.
│   │   ├── containers/
│   │   │   └── augure-sandbox/
│   │   │       ├── Dockerfile    # Universal image (node+python+playwright+gh)
│   │   │       └── entrypoint.sh
│   │   └── package.json
│   │
│   ├── channels/                 # Messaging integrations
│   │   ├── src/
│   │   │   ├── interface.ts      # Channel interface (send, receive, react)
│   │   │   ├── telegram.ts       # Telegram Bot API (grammy)
│   │   │   ├── whatsapp.ts       # WhatsApp via Baileys (P1)
│   │   │   └── web.ts            # REST + WebSocket for dashboard (P2)
│   │   └── package.json
│   │
│   └── tools/                    # Native tools (in-process, no container)
│       ├── src/
│       │   ├── interface.ts      # NativeTool interface
│       │   ├── web-search.ts     # Tavily / SearXNG API
│       │   ├── memory.ts         # Read/write memory files
│       │   ├── schedule.ts       # Cron job management
│       │   ├── http.ts           # Simple HTTP client
│       │   ├── skill-run.ts      # Trigger skill execution
│       │   └── opencode.ts       # Bridge to OpenCode container
│       └── package.json
│
├── config/
│   └── augure.json5               # User configuration
│
├── memory/                       # Persistent memory store (git-tracked optional)
│   ├── preferences/
│   │   ├── communication_style.md
│   │   └── interests.md
│   ├── knowledge/
│   │   ├── personal/
│   │   └── professional/
│   ├── relationships/
│   │   └── contacts.md
│   └── context/
│       ├── active_tasks.md
│       └── recent_conversations/
│
├── skills/                       # User skills (auto-generated)
│   └── .gitkeep
│
├── apps/
│   └── docs/                     # Documentation site (Fumadocs + Next.js)
│       ├── next.config.mjs
│       ├── app/
│       └── content/              # MDX doc pages
│
└── docs/
    ├── getting-started.md
    ├── configuration.md
    ├── tools.md
    ├── memory.md
    └── deployment.md
```

---

## Configuration

Single config file in JSON5 (`augure.json5`):

```json5
{
  // Identity
  identity: {
    name: "Augure",
    personality: "Helpful, proactive, concise. Speaks French by default.",
  },

  // LLM Providers (configurable per usage)
  llm: {
    default: {
      provider: "openrouter",          // openrouter | anthropic | openai
      apiKey: "${OPENROUTER_API_KEY}",  // env var interpolation
      model: "anthropic/claude-sonnet-4-5",
      maxTokens: 8192,
    },
    // Override per usage type (falls back to default if not set)
    reasoning: {},                     // Full conversations — uses default
    ingestion: {
      model: "google/gemini-2.5-flash",  // Cheap model for memory extraction
      maxTokens: 2048,
    },
    monitoring: {
      model: "google/gemini-2.5-flash",  // Cheap model for heartbeat checks
      maxTokens: 1024,
    },
    coding: {
      model: "anthropic/claude-sonnet-4-5", // Best model for code tasks
      maxTokens: 16384,
    },
  },

  // Channels
  channels: {
    telegram: {
      enabled: true,
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowedUsers: [123456789],      // Telegram user IDs
    },
    whatsapp: {
      enabled: false,                 // P1
    },
    web: {
      enabled: false,                 // P2
      port: 3000,
    },
  },

  // Memory
  memory: {
    path: "./memory",
    autoIngest: true,                 // Extract facts from conversations
    maxRetrievalTokens: 2000,         // Max tokens injected as context
  },

  // Scheduler
  scheduler: {
    heartbeatInterval: "30m",         // Proactive check-in interval
    jobs: [
      {
        id: "apartment-search",
        cron: "0 8 * * *",            // Every day at 8am
        prompt: "Search for new furnished apartments in Bordeaux under 1100€/month. Compare with yesterday's results and report only new listings.",
        channel: "telegram",
      },
      {
        id: "stock-report",
        cron: "0 18 * * 1-5",         // Weekdays at 6pm
        prompt: "Check my portfolio stocks and give me a daily summary with price changes.",
        channel: "telegram",
      },
      {
        id: "email-digest",
        cron: "0 9,14,19 * * *",      // 9am, 2pm, 7pm
        prompt: "Check my inbox for important emails. Summarize anything urgent.",
        channel: "telegram",
      },
    ],
  },

  // Sandbox
  sandbox: {
    runtime: "docker",                // docker | modal (future)
    defaults: {
      timeout: 300,                   // 5 min default
      memoryLimit: "512m",
      cpuLimit: "1.0",
    },
    playwright: {
      image: "augure-playwright:latest",
      timeout: 120,
    },
    codeAgent: {
      image: "augure-code-agent:latest",
      timeout: 600,                   // 10 min for coding tasks
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-5",
    },
  },

  // Tools
  tools: {
    webSearch: {
      provider: "tavily",             // tavily | searxng
      apiKey: "${TAVILY_API_KEY}",
    },
    email: {
      imap: {
        host: "imap.gmail.com",
        port: 993,
        user: "${EMAIL_USER}",
        password: "${EMAIL_PASSWORD}",
      },
      smtp: {
        host: "smtp.gmail.com",
        port: 587,
        user: "${EMAIL_USER}",
        password: "${EMAIL_PASSWORD}",
      },
    },
    github: {
      token: "${GITHUB_TOKEN}",
    },
  },

  // Security
  security: {
    sandboxOnly: true,               // All shell/code execution in containers
    allowedHosts: [],                // Restrict outbound network (empty = all)
    maxConcurrentSandboxes: 3,
  },
}
```

---

## Memory System

Filesystem-first, observational memory. Pure markdown files on disk — no vector DB, no embeddings. Inspired by Mastra's observational memory pattern and LlamaIndex's filesystem benchmark results showing filesystem agents outperform RAG on correctness and relevance.

### Why Not RAG?

| RAG approach | Augure's filesystem approach |
|---|---|
| Requires vector DB (Pinecone, Qdrant, etc.) | Requires `ls` and `cat` |
| Embed → store → query → rerank pipeline | LLM reads files directly |
| Dynamic retrieval invalidates prompt cache | Stable memory block enables cache hits (4-10x cost reduction) |
| Chunking loses context | Full file context preserved |
| Opaque — can't inspect what's stored | `vim memory/preferences/interests.md` |
| Complex migration/backup | `cp -r memory/ /backup/` |

### Structure

```
memory/
├── identity.md              # Who the user is, background, goals
├── observations.md          # 🆕 Dated observation log (append-only)
├── preferences/
│   ├── communication.md     # Language, tone, verbosity preferences
│   ├── interests.md         # Topics, hobbies, current focus areas
│   └── tools.md             # Preferred tools, languages, workflows
├── knowledge/
│   ├── personal/
│   │   ├── housing.md       # Apartment search criteria, history
│   │   ├── finance.md       # Portfolio, budget, tax info
│   │   └── health.md        # If relevant
│   └── professional/
│       ├── role.md           # Current job, responsibilities
│       ├── projects.md       # Active projects and status
│       └── skills.md         # Technical skills, certifications
├── relationships/
│   └── contacts.md          # Key people, their roles, context
└── context/
    ├── active_tasks.md      # Currently running / pending tasks
    ├── decisions.md         # Past decisions and reasoning
    └── conversations/
        ├── 2026-02-20.md    # Daily conversation summaries
        └── ...
```

### How It Works

1. **Ingestion (Observer)** — After each conversation, a cheap model (Gemini Flash) extracts key facts and appends dated observations to `observations.md` + updates relevant category files. This is append-only — new facts don't delete old ones.
2. **Reflection (Compactor)** — Weekly (or when observations.md exceeds a threshold), the agent re-reads all memory, merges duplicates, resolves contradictions (newer supersedes older), and compresses. This is the only destructive memory operation.
3. **Retrieval** — Before responding, the agent selects relevant memory files based on the current query and injects them as context. The observations.md file provides a stable, cacheable prefix.
4. **Proactive** — The scheduler reads memory to understand patterns and trigger proactive actions (e.g., "user always checks stocks on Monday → prepare report")
5. **User-editable** — Memory is plain markdown, users can view and edit directly. Optionally git-tracked for history.

### Temporal Awareness

Each observation is dated, enabling the agent to handle contradictions:

```markdown
<!-- observations.md -->
## 2026-01-15
- User lives in Bordeaux, works at Monsieur TSHIRT
- Looking for apartments under 1100€/month in Bordeaux

## 2026-02-10
- User accepted new job at TechCorp, starting March 1
- Now looking for apartments in Paris, budget increased to 1500€/month
```

The Reflector agent knows "Paris 1500€" supersedes "Bordeaux 1100€" based on dates.

### Dual-Mode Cost Optimization

- **Monitor mode** (cheap) — Heartbeat uses a small/fast model to check if anything needs attention
- **Reason mode** (full) — When action is needed, switches to the primary model for full reasoning

---

## Context Window Assembly

The most important engineering decision in any agentic system. Everything the model knows, believes, and can do flows through context assembly.

### Design Goals

1. **Stable prefix for prompt caching** — Anthropic's cache reads cost $0.30/MTok vs $3.00/MTok for fresh. Claude Code achieves 92% prefix reuse. We want the same.
2. **Memory always present** — No retrieval step. Observations are IN context, not fetched dynamically.
3. **Skills loaded on-demand** — Like OpenClaw: only skill metadata in system prompt, full skill.md loaded when needed.
4. **Graceful degradation** — When approaching limits, compress conversation history, never drop system prompt or memory.

### Assembly Order (Stable → Dynamic)

```
┌─────────────────────────────────────────────────────────────┐
│  ZONE 1: STATIC PREFIX (cached across turns)                │
│  ≈ stable for entire session → maximum cache hits            │
│                                                              │
│  ① System Prompt (persona + rules + capabilities)           │
│  ② Memory: observations.md (compressed observation log)     │
│  ③ Memory: relevant category files (identity, preferences)  │
│  ④ Active Persona overlay (if task-specific)                │
│  ⑤ Tool schemas (native tools + opencode description)       │
│  ⑥ Skill index (name + description + trigger, NOT full code)│
│                                                              │
│  Anthropic cache_control breakpoint here ─────────────────  │
├─────────────────────────────────────────────────────────────┤
│  ZONE 2: SEMI-STABLE (changes occasionally)                  │
│                                                              │
│  ⑦ Active tasks context (from context/active_tasks.md)      │
│  ⑧ Loaded skill content (full skill.md, on-demand)          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  ZONE 3: DYNAMIC (changes every turn)                        │
│                                                              │
│  ⑨ Conversation history (most recent turns)                 │
│  ⑩ Tool call results from current turn                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Token Budget (Target: Claude Sonnet 4.5, 200K window)

| Zone | Content | Budget | Notes |
|------|---------|--------|-------|
| 1 | System prompt + persona | ~2K tokens | Lean by design |
| 1 | observations.md | ~5-10K tokens | Compressed, grows slowly |
| 1 | Memory category files | ~3-5K tokens | Select only relevant files |
| 1 | Tool schemas | ~2K tokens | 7 native tools, compact schemas |
| 1 | Skill index | ~1-2K tokens | Name + description only, ~50 chars/skill |
| 2 | Active tasks | ~1-2K tokens | Currently running tasks |
| 2 | Loaded skill content | ~1-3K tokens | Only when skill is invoked |
| 3 | Conversation history | ~10-50K tokens | Most recent, older compacted |
| 3 | Tool results | ~5-20K tokens | Current turn only |
| **Total** | | **~30-90K tokens** | Well within 200K limit |
| **Reserved** | For LLM output | ~8-16K tokens | maxTokens config |

### Context Window Guard

```typescript
interface ContextGuard {
  maxContextTokens: number;       // Model limit (e.g., 200_000)
  reservedForOutput: number;       // maxTokens from config (e.g., 8_192)
  
  // Budget allocation (percentages of available space)
  budgets: {
    systemPrompt: 'unlimited';    // Never truncated
    memory: 0.15;                 // 15% max
    skills: 0.05;                 // 5% max
    conversation: 0.60;           // 60% max (largest)
    toolResults: 0.20;            // 20% max
  };
  
  // Overflow strategies (applied in order)
  strategies: [
    'truncate_old_tool_results',   // Remove tool results from previous turns
    'summarize_old_conversation',  // LLM-summarize turns beyond threshold
    'trim_memory_files',           // Keep observations.md, drop category files
    'refuse_with_explanation',     // Tell user context is full
  ];
}
```

### Compaction Strategy

When conversation history approaches its budget:

1. **Keep last N turns verbatim** (configurable, default: 10)
2. **Summarize older turns** into a `[Conversation Summary]` block using the ingestion model (cheap)
3. **Drop old tool results** — they're in the audit log if needed
4. **Never touch Zone 1** — system prompt, memory, and tool schemas are sacred

This mirrors OpenClaw's approach but with an important difference: our memory observations are already compressed, so the prefix stays stable longer and cache hits are higher.

### Prompt Caching Strategy

```
Turn 1: [system prompt + memory + tools + skill index] + [conversation]
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         Cache this prefix ($0.30/MTok on reads)

Turn 2: [same prefix] + [conversation + new message]
         ^^^^^^^^^^^^
         Cache HIT ✅ (90% savings)

Turn 3: [same prefix] + [conversation + new message + tool results]
         ^^^^^^^^^^^^
         Cache HIT ✅

Turn N (memory ingestion runs):
        [system prompt + UPDATED memory + tools + skill index] + [conversation]
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         Cache MISS ❌ (new prefix, one-time write cost)
         Subsequent turns cache this new prefix
```

Memory ingestion is the only thing that invalidates the prefix cache. Since ingestion runs periodically (not every turn), we get long cache hit streaks.

---

## Persona System

Augure uses **dynamic personas** — different behavioral overlays loaded based on the task at hand. The base system prompt is always the same, but a persona adds domain-specific instructions, tone, and constraints.

### Why Dynamic Personas?

A single "do everything" system prompt either:
- Is too generic → poor results on specialized tasks
- Is too long → wastes tokens and dilutes instructions

With personas, the agent becomes a **specialist on demand**: a coding assistant, a financial advisor, a writing coach — each with the right tone and expertise for the task.

### Structure

```
config/personas/
├── default.md          # General-purpose assistant
├── coder.md            # Code generation, debugging, architecture
├── analyst.md          # Data analysis, financial reasoning
├── writer.md           # Creative writing, emails, content
├── ops.md              # DevOps, infrastructure, monitoring
└── custom/             # User-created personas
    └── real-estate.md  # Specialized for apartment hunting
```

### Persona Format

```markdown
---
id: coder
name: Code Assistant
triggers:
  - keywords: [code, bug, function, refactor, PR, deploy, typescript, python]
  - skills: [github-*, code-*]  # Auto-activate for matching skills
priority: 10  # Higher = preferred when multiple match
---

## Role
You are a senior software engineer. Write clean, typed, tested code.

## Style
- Be concise. Show code, not explanations.
- Always suggest tests alongside implementation.
- Prefer TypeScript. Use modern Node.js patterns (ESM, top-level await).

## Constraints
- Never use `any` type in TypeScript.
- Always handle errors explicitly.
- Suggest the simplest solution first.
```

### Loading Strategy

1. **Auto-detection**: The orchestrator examines the user message + active skill and matches against persona `triggers` (keywords, skill patterns)
2. **Explicit switch**: User sends `/persona coder` or the agent decides based on context
3. **Stacking**: Base `default.md` is always loaded. Task-specific persona is **appended** (not replaced). This means the agent always has base manners + specialized behavior.
4. **Cost-free**: Personas are tiny (200-500 tokens). They fit in Zone 1 of the context window and get cached.

### Context Assembly with Personas

```
① System prompt base (always present)
   "You are Augure, a personal AI assistant..."
   
② Active persona overlay (if any)
   "## Active Persona: Code Assistant
    You are a senior software engineer..."

③ Memory observations (stable)
④ Memory category files (relevant)
⑤ Tool schemas
⑥ Skill index
─── cache breakpoint ───
⑦ Conversation history
⑧ Tool results
```

### Built-in Personas (V0)

| Persona | Triggers | Specialty |
|---------|----------|-----------|
| `default` | Always loaded | General purpose, friendly, concise |
| `coder` | Code keywords, GitHub skills | Clean code, testing, architecture |
| `analyst` | Data, numbers, charts, reporting | Data analysis, structured outputs |
| `ops` | Server, deploy, docker, DNS, infra | DevOps, troubleshooting |

Users can create their own personas by dropping markdown files in `config/personas/custom/`.

---

## Testing Strategy

### Philosophy

Everything deterministic is tested. LLM calls are mocked at the boundary. No excuses.

### Test Pyramid

```
         ╱╲
        ╱  ╲        E2E Tests (few)
       ╱ E2E╲       Full agent loop with mocked LLM
      ╱──────╲
     ╱        ╲     Integration Tests (moderate)
    ╱ Integr.  ╲    Package interactions, Docker, filesystem
   ╱────────────╲
  ╱              ╲  Unit Tests (many)
 ╱    Unit        ╲ Pure functions, parsers, guards, formatters
╱──────────────────╲
```

### Test Categories

#### Unit Tests (target: >90% coverage on deterministic code)

Every package has its own test suite. These test pure logic with zero external dependencies:

```typescript
// packages/core/src/__tests__/context-guard.test.ts
describe('ContextGuard', () => {
  it('should truncate old tool results first when over budget', () => { ... });
  it('should summarize conversation when tool truncation is not enough', () => { ... });
  it('should never truncate system prompt or memory', () => { ... });
  it('should calculate token budget correctly', () => { ... });
});

// packages/memory/src/__tests__/memory-store.test.ts
describe('MemoryStore', () => {
  it('should read markdown files from memory directory', () => { ... });
  it('should append observations with timestamp', () => { ... });
  it('should handle concurrent writes safely', () => { ... });
  it('should select relevant files based on keywords', () => { ... });
});

// packages/skills/src/__tests__/skill-parser.test.ts
describe('SkillParser', () => {
  it('should parse skill.md frontmatter correctly', () => { ... });
  it('should validate required fields', () => { ... });
  it('should reject invalid cron expressions', () => { ... });
});

// packages/sandbox/src/__tests__/pool.test.ts
describe('ContainerPool', () => {
  it('should maintain minWarm containers', () => { ... });
  it('should recycle idle containers after timeout', () => { ... });
  it('should destroy tainted containers', () => { ... });
  it('should respect maxTotal limit', () => { ... });
});
```

**What to unit test:**
- Context window assembly logic (token counting, budget allocation, truncation)
- Memory file parsing and writing
- Skill.md parsing and validation
- Config loading and env var interpolation
- Persona matching (keyword triggers, priority)
- Scheduler cron expression parsing
- Action log formatting
- Cost tracking calculations
- Message router matching rules

#### Integration Tests (test real interactions between packages)

These use real filesystem, real Docker (via testcontainers), but mocked LLM:

```typescript
// tests/integration/memory-ingestion.test.ts
describe('Memory Ingestion Pipeline', () => {
  it('should extract observations from conversation and write to files', async () => {
    const mockLLM = createMockLLM({
      response: '- User prefers TypeScript\n- Working on project Augure'
    });
    const store = new MemoryStore(tmpDir);
    const ingester = new MemoryIngester(mockLLM, store);
    
    await ingester.ingest(sampleConversation);
    
    const observations = await store.readFile('observations.md');
    expect(observations).toContain('User prefers TypeScript');
  });
});

// tests/integration/skill-lifecycle.test.ts
describe('Skill Lifecycle', () => {
  it('should generate, test, and deploy a skill', async () => {
    // Uses real Docker containers, mocked LLM for generation
    ...
  });
});

// tests/integration/container-pool.test.ts
describe('Container Pool (real Docker)', () => {
  it('should acquire and release containers', async () => {
    // Uses testcontainers library
    ...
  });
});

// tests/integration/context-assembly.test.ts
describe('Context Assembly', () => {
  it('should assemble full context from memory + persona + history', async () => {
    // Real filesystem, real memory files, mocked LLM
    ...
  });
});
```

**What to integration test:**
- Memory ingestion (mock LLM → real filesystem writes)
- Context assembly (real memory files → correct prompt structure)
- Skill lifecycle (generate → save → parse → validate)
- Container pool with real Docker
- Telegram message serialization/deserialization
- Config loading with real `.env` files
- Scheduler job registration and triggering

#### E2E Tests (full agent loop)

End-to-end tests with a mocked LLM and a mocked Telegram channel:

```typescript
// tests/e2e/agent-loop.test.ts
describe('Agent E2E', () => {
  it('should receive message → assemble context → call LLM → respond', async () => {
    const mockTelegram = new MockTelegramChannel();
    const mockLLM = createMockLLM({ /* scripted responses */ });
    const agent = createAgent({ channels: [mockTelegram], llm: mockLLM });
    
    await mockTelegram.simulateMessage('What apartments are available?');
    
    expect(mockLLM.lastCall.messages).toContainMemoryContext();
    expect(mockTelegram.lastResponse).toBeDefined();
  });

  it('should handle tool call → execute in sandbox → return result', async () => {
    // Full loop with real Docker sandbox
    ...
  });
});
```

### LLM Boundary: The Mock Strategy

```typescript
// tests/helpers/mock-llm.ts
interface MockLLMConfig {
  responses: Array<{
    match?: RegExp;              // Match on user message content
    response: string;            // Text response
    toolCalls?: ToolCall[];      // Simulate tool use
  }>;
  defaultResponse?: string;
}

function createMockLLM(config: MockLLMConfig): LLMClient {
  return {
    async chat(messages: Message[]): Promise<LLMResponse> {
      const userMsg = messages.findLast(m => m.role === 'user');
      const matched = config.responses.find(r => 
        r.match ? r.match.test(userMsg?.content ?? '') : true
      );
      return {
        content: matched?.response ?? config.defaultResponse ?? 'Mock response',
        toolCalls: matched?.toolCalls ?? [],
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    }
  };
}
```

The key principle: **the LLM client is an interface**. In production, it calls OpenRouter. In tests, it returns scripted responses. Everything around it (context assembly, tool dispatch, memory, skills) is deterministic and fully testable.

### Tooling

| Tool | Purpose |
|------|---------|
| **vitest** | Test runner (fast, TypeScript-native, ESM) |
| **testcontainers** | Real Docker containers in integration tests |
| **msw** | Mock HTTP for OpenRouter API calls |
| **tmp-promise** | Temp directories for filesystem tests |

### CI Pipeline

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm run test:unit        # All packages, no Docker needed

  integration:
    runs-on: ubuntu-latest
    services:
      docker: { image: 'docker:dind' }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: docker build -t augure-sandbox containers/augure-sandbox/
      - run: pnpm run test:integration  # Real Docker, mocked LLM

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm run lint               # ESLint + Prettier
      - run: pnpm run typecheck           # tsc --noEmit
```

### Scripts (package.json root)

```json
{
  "scripts": {
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:e2e": "vitest run tests/e2e/",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint packages/ --ext .ts",
    "typecheck": "turbo run typecheck",
    "ci": "pnpm run lint && pnpm run typecheck && pnpm run test"
  }
}
```

---

## Tool System

Augure uses a **hybrid execution model**: lightweight native tools for frequent operations, OpenCode in sandboxed containers for everything else.

### Native Tools (in-process, no container)

These run directly in the agent process. Fast, no overhead.

```typescript
interface NativeTool {
  name: string;
  description: string;
  parameters: JSONSchema;           // For LLM function calling
  execute: (params: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  memory: MemoryStore;
  scheduler: Scheduler;
  channels: ChannelManager;
  pool: ContainerPool;
  config: Config;
}

interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: Artifact[];           // Files, images, etc.
}
```

| Tool | Description |
|------|-------------|
| `web_search` | Tavily or SearXNG API call |
| `memory_read` | Read from memory/*.md |
| `memory_write` | Update memory files |
| `schedule` | Create/update/delete cron jobs |
| `http` | Simple HTTP requests (GET/POST with auth) |
| `skill_run` | Trigger a skill execution |
| `opencode` | Delegate complex task to OpenCode container |

### OpenCode (universal executor, sandboxed)

When no native tool fits, the orchestrator delegates to OpenCode running in a warm container. OpenCode can do **anything** — it replaces what would traditionally be 10+ separate tools:

- **Browser automation** → Playwright (scraping, forms, screenshots)
- **Shell commands** → curl, jq, grep, awk, file manipulation
- **Python scripts** → Data analysis, pandas, API integrations
- **Node/TS execution** → Complex logic, orchestrations
- **Git/GitHub** → Clone, branch, commit, PR via `gh` CLI
- **Email** → IMAP/SMTP via scripts
- **Any installed CLI tool** → Pre-installed in container image

The `opencode` native tool acts as the bridge:

```typescript
// The orchestrator calls this when no native tool fits
{
  name: 'opencode',
  description: 'Execute a complex task using OpenCode in a sandboxed container. Can run shell, browser, Python, Node, git, and any CLI tool.',
  parameters: {
    task: 'string',         // Natural language description of what to do
    trust: 'sandboxed | trusted',
    timeout: 'number',
    mounts: 'string[]',     // Optional: paths to mount in container
  }
}
```

### Decision Flow (Orchestrator)

The LLM orchestrator decides tool routing:

1. **Memory/schedule/search?** → Native tool (instant, no container)
2. **Simple API call?** → Native `http` tool
3. **Existing skill?** → `skill_run` → delegates to skill runner → container
4. **Complex task (browser, code, multi-step)?** → `opencode` → warm container
5. **New recurring capability?** → Skills engine → generate + deploy skill

### Custom Capabilities → Skills

Instead of a static plugin system, Augure uses **Skills** — self-generated capabilities the agent creates, tests, and maintains autonomously. See the **Skill System** section below.

---

## Skill System

Skills are the core learning mechanism of Augure. A skill is a reusable capability that the agent teaches itself through conversation, then executes autonomously. Skills are **hybrid**: a markdown descriptor (what + why) paired with generated TypeScript code (how).

### Skill Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SKILL LIFECYCLE                              │
│                                                                     │
│  ① TRIGGER          ② CLARIFY           ③ GENERATE                 │
│  "Apprends à..."    Agent asks          Agent writes                │
│  "Surveille..."     clarifying          skill.md + skill.ts         │
│  "Chaque jour..."   questions           in sandbox                  │
│                                                                     │
│  ④ TEST             ⑤ DEPLOY            ⑥ SELF-HEAL                │
│  Run in sandbox     Activate skill      Monitor executions          │
│  Validate output    Create cron if      Auto-fix on failure         │
│  Auto-debug         recurring           Re-test & redeploy          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Skill Format (Hybrid)

Each skill lives in `skills/<skill-id>/`:

```
skills/
├── apartment-search/
│   ├── skill.md          # Descriptor: what, why, config, history
│   ├── skill.ts          # Generated executable code
│   ├── skill.test.ts     # Auto-generated test
│   └── runs/             # Execution logs
│       ├── 2026-02-21T08:00:00.json
│       └── ...
├── email-triage/
│   ├── skill.md
│   ├── skill.ts
│   ├── skill.test.ts
│   └── runs/
└── ...
```

#### skill.md — Descriptor

```markdown
---
id: apartment-search
name: Recherche d'appartements Bordeaux
version: 3
created: 2026-02-21T10:00:00Z
updated: 2026-02-22T08:15:00Z
status: active            # draft | testing | active | paused | broken
trigger:
  type: cron
  schedule: "0 8 * * *"   # Every day at 8am
  channel: telegram        # Where to send results
sandbox: true              # Requires isolated execution
tools:                     # Tools this skill depends on
  - browser
  - memory_read
tags: [housing, monitoring, personal]
---

# Recherche d'appartements Bordeaux

## Goal
Find new furnished apartment listings in Bordeaux under 1100€/month
and send a daily report with only new listings (compared to previous run).

## User Requirements
- Sites: SeLoger, LeBonCoin
- Max rent: 1100€/month
- Type: Meublé (furnished)
- Min surface: 30m²
- Location: Bordeaux et agglomération

## Strategy
1. Navigate to SeLoger with filters pre-set
2. Scrape listing cards (title, price, surface, URL, photo)
3. Navigate to LeBonCoin with equivalent filters
4. Scrape listing cards
5. Compare with previous run (stored in memory/knowledge/personal/housing.md)
6. Report only new listings with links and key info
7. Update stored listings

## Revision History
- v1 (2026-02-21): Initial version, SeLoger only
- v2 (2026-02-21): Added LeBonCoin, fixed price filter selector
- v3 (2026-02-22): Self-healed — SeLoger changed DOM structure, updated selectors
```

#### skill.ts — Generated Executable

```typescript
import { SkillContext, SkillResult } from '@augure/core';

export interface ApartmentListing {
  id: string;
  title: string;
  price: number;
  surface: number;
  url: string;
  source: 'seloger' | 'leboncoin';
  photo?: string;
}

export default async function execute(ctx: SkillContext): Promise<SkillResult> {
  const { browser, memory, report } = ctx;

  // 1. Load previous listings
  const previous = await memory.read('knowledge/personal/housing.md');
  const knownIds = extractListingIds(previous);

  // 2. Scrape SeLoger
  const selogerListings = await scrapeSeLoger(browser);

  // 3. Scrape LeBonCoin
  const lbcListings = await scrapeLeBonCoin(browser);

  // 4. Find new listings
  const allListings = [...selogerListings, ...lbcListings];
  const newListings = allListings.filter(l => !knownIds.has(l.id));

  // 5. Update memory
  await memory.write('knowledge/personal/housing.md', formatListings(allListings));

  // 6. Report
  if (newListings.length > 0) {
    return report.send(formatReport(newListings));
  }
  return report.silent('No new listings found');
}

// ... generated helper functions
```

### Skill Creation Flow (Full Auto)

When the user describes a new capability, Augure autonomously:

```
User: "Surveille les nouveaux apparts meublés à Bordeaux sous 1100€ 
       sur SeLoger et LeBonCoin, envoie-moi un rapport chaque matin"
                              │
                              ▼
              ┌───────────────────────────────┐
              │  ① INTENT DETECTION           │
              │  Agent detects "learn" intent  │
              │  → enters skill creation mode  │
              └───────────────┬───────────────┘
                              │ (if requirements are clear enough)
                              ▼
              ┌───────────────────────────────┐
              │  ② CLARIFY (if needed)        │
              │  "Quelle surface minimum ?"   │
              │  "Bordeaux centre ou agglo ?"  │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  ③ GENERATE                   │
              │  - Write skill.md descriptor   │
              │  - Generate skill.ts code      │
              │  - Generate skill.test.ts      │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  ④ TEST (in sandbox)          │
              │  - Spin up Playwright sandbox  │
              │  - Run skill.test.ts           │
              │  - Validate output shape       │
              │  - If fail → auto-debug:       │
              │    analyze error, fix code,     │
              │    re-test (max 5 retries)     │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  ⑤ DEPLOY                     │
              │  - Save skill to skills/       │
              │  - Register cron job           │
              │  - Notify user: "Skill actif,  │
              │    rapport chaque jour à 8h"  │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  ⑥ SELF-HEAL (ongoing)        │
              │  On execution failure:         │
              │  - Analyze error logs           │
              │  - Regenerate/patch code        │
              │  - Re-test in sandbox           │
              │  - If fixed → redeploy + bump v │
              │  - If stuck (3 failures) →      │
              │    pause + notify user          │
              └───────────────────────────────┘
```

### Self-Healing

Skills auto-repair when they break. The agent:

1. Detects failure from execution logs (`runs/*.json`)
2. Reads the error + the current `skill.ts` + `skill.md`
3. Uses the coding LLM to diagnose and patch
4. Re-tests in sandbox
5. If fixed: bumps version in `skill.md`, deploys
6. If still broken after 3 attempts: pauses skill, notifies user

Common self-heal scenarios:
- **DOM changes**: Website updated its layout → agent updates CSS selectors
- **API changes**: Endpoint returns different schema → agent adapts parser
- **Rate limiting**: Site blocks scraping → agent adds delays/rotation
- **Auth expiry**: Token expired → agent refreshes or asks user

### Skill Context API

```typescript
interface SkillContext {
  // Tools
  browser: BrowserSandbox;         // Playwright in container
  shell: ShellSandbox;             // Shell in container
  http: HttpClient;                // Fetch with retries
  
  // State
  memory: MemoryStore;             // Read/write memory files
  state: SkillState;               // Skill-local persistent state
  previousRun: RunResult | null;   // Last execution result
  
  // Output
  report: {
    send: (msg: string) => Promise<SkillResult>;     // Send to channel
    silent: (msg: string) => Promise<SkillResult>;   // Log only, no notify
    alert: (msg: string) => Promise<SkillResult>;    // Urgent notification
  };

  // Config
  config: SkillConfig;             // From skill.md frontmatter
  llm: LLMClient;                  // For skills that need LLM reasoning
}
```

### Built-in Skills (Pre-installed)

| Skill | Trigger | Description |
|-------|---------|-------------|
| `daily-digest` | cron | Morning briefing: weather, calendar, priority emails |
| `email-triage` | cron | Classify inbox, flag urgent, summarize important |
| `memory-consolidate` | cron (weekly) | Clean up and consolidate memory files |
| `skill-health-check` | cron (daily) | Test all active skills, self-heal if broken |

### Skill Management

```bash
# CLI
augure skills list                  # List all skills with status
augure skills show <id>             # Show skill descriptor
augure skills run <id>              # Trigger manual execution
augure skills pause <id>            # Pause a skill
augure skills resume <id>           # Resume a paused skill
augure skills delete <id>           # Remove a skill
augure skills logs <id>             # Show execution history

# Via chat
"Montre-moi mes skills"
"Pause le skill apartment-search"
"Relance la recherche d'apparts maintenant"
"Supprime le skill stock-monitor"
```

### Skill Registry (P2 — Future)

For later: a community registry where users share skills.

```
augure skills search "crypto monitoring"
augure skills install <registry-url>
augure skills publish <id>
```

Skills are sandboxed by default, so community skills can't access the host system. Each installed skill runs in its own container with scoped permissions.

---

## Sandbox System (Container Pool)

All execution via OpenCode happens in Docker containers managed by a **warm pool**. Containers are pre-created and kept ready so there's no cold-start latency.

### Pool Architecture

```
┌──────────────────────────────────────────────────┐
│              Container Pool Manager               │
│                                                   │
│  Config: minWarm=2, maxTotal=5, idleTimeout=10m   │
│                                                   │
│  ┌────────┐  ┌────────┐  ┌────────┐              │
│  │ 🟢 C1  │  │ 🟢 C2  │  │ 🟡 C3  │              │
│  │ warm   │  │ warm   │  │ idle   │              │
│  │ ready  │  │ ready  │  │ 8m ago │              │
│  └────────┘  └────────┘  └────────┘              │
│                                                   │
│  Lifecycle:                                       │
│  CREATE → WARM → ACQUIRED → RELEASED → WARM       │
│                     │                              │
│                     └──(tainted?)──→ DESTROYED     │
│                                                   │
│  Replenish: if warm < minWarm → create new        │
│  Recycle:   if idle > idleTimeout → destroy        │
└──────────────────────────────────────────────────┘
```

### Container Image (Single Universal Image)

Instead of separate images per tool, one image with everything pre-installed:

```dockerfile
# containers/augure-sandbox/Dockerfile
FROM node:22-slim

# OpenCode
RUN npm install -g opencode

# Browser automation
RUN npx playwright install --with-deps chromium

# Python + data tools
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    curl jq git gh ripgrep \
    && pip3 install --break-system-packages \
    requests beautifulsoup4 pandas

# Workspace
WORKDIR /workspace
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

One image means:
- Simpler to build and maintain
- Every container can do everything
- No need to predict which tools a task will need
- OpenCode decides what to use at runtime

### Trust Levels

| Level | Network | Filesystem | When |
|-------|---------|-----------|------|
| `sandboxed` (default) | Isolated (no host) | `/workspace` only | Web scraping, untrusted skills, user-generated code |
| `trusted` | Host network | Can mount host paths | Personal git repos, email, API keys injected |

### Container Lifecycle

```
1. Pool starts with minWarm containers pre-created
2. Task arrives → acquire() picks a warm container
3. OpenCode runs inside with task description + tools
4. Output streamed back to agent via Docker exec API
5. release() → container returns to pool (if clean)
6. If tainted (npm install, pip install, etc.) → destroy + create fresh
7. Pool replenishes to maintain minWarm
```

---

## Observability & Audit Trail

Every action the agent takes is logged. This is non-negotiable — it's both a debugging tool and a security requirement.

### Action Log Format

Append-only JSONL files, one per day:

```
logs/
├── actions/
│   ├── 2026-02-21.jsonl     # All actions taken today
│   └── ...
├── conversations/
│   ├── 2026-02-21.jsonl     # Full conversation transcripts
│   └── ...
└── skills/
    ├── apartment-search/
    │   └── runs/
    │       └── 2026-02-21T08:00:00.jsonl
    └── ...
```

### Action Log Entry

```jsonc
{
  "ts": "2026-02-21T08:00:03Z",
  "trigger": "cron",           // "user" | "cron" | "heartbeat" | "skill"
  "skill_id": "apartment-search",
  "action": "opencode",
  "trust": "sandboxed",
  "container_id": "abc123",
  "input_summary": "Scrape SeLoger for Bordeaux apartments < 1100€",
  "output_summary": "Found 3 new listings",
  "tokens": { "input": 2340, "output": 890, "model": "gemini-2.5-flash", "cost_usd": 0.0012 },
  "duration_ms": 4230,
  "success": true
}
```

### Cost Tracking

The agent tracks cumulative daily spend. If it exceeds the configured `maxDailySpend`, it:
1. Pauses all non-essential cron jobs
2. Switches remaining interactions to the cheapest available model
3. Notifies the user via Telegram

### Kill Switch

| Command | Effect |
|---------|--------|
| `/pause` | Pauses all cron jobs and skills. Agent still responds to direct messages. |
| `/resume` | Resumes all scheduled activity. |
| `/pause <skill_id>` | Pauses a specific skill. |
| `/status` | Shows active skills, daily spend, container pool health. |
| `/kill` | Emergency stop. Kills all containers, pauses everything, agent enters read-only mode. |

---

## Security Model

### Attack Surface by Milestone

```
M0 (Telegram)     →  ZERO inbound ports
                      Bot uses long-polling (outbound HTTPS only)
                      Attack surface: SSH + Docker socket + Telegram token

M1 (WhatsApp)     →  ZERO inbound ports
                      Baileys uses WebSocket polling (outbound only)
                      Attack surface: same as M0 + WhatsApp session keys

M4 (Web dashboard) →  ONE inbound port (3000)
                      ⚠️  Requires Tailscale or reverse proxy
                      NEVER expose directly to the internet

M5 (Webhooks)     →  ONE inbound port (webhook receiver)
                      ⚠️  Use Tailscale Funnel or Cloudflare Tunnel
```

**V0-M2 requires no Tailscale and no firewall configuration.** The agent only makes outbound connections. This is a fundamental architectural advantage over OpenClaw, which exposes a WebSocket gateway + control UI by default.

### Threat Model

| Threat | Vector | Mitigation |
|--------|--------|-----------|
| **Prompt injection via email/web** | Agent reads malicious email with hidden instructions | "Rule of Two": reading untrusted content and executing actions never happen in the same LLM call. Content from external sources is marked as `untrusted` in the prompt. Destructive actions require user confirmation. |
| **Skill poisoning** | Malicious skill code runs on the host | All skill execution in sandboxed containers (default). No community skill registry. Skills are self-generated or user-written. |
| **Credential leak** | API keys exposed in config/logs/memory | Secrets stored in `.env` only, injected via environment variables. Never written to memory files. Log entries use summary strings, not raw API responses. |
| **Docker socket escape** | Compromised container accesses host via Docker socket | The main Augure process holds the Docker socket. Sandboxed containers do NOT mount it. Container capabilities are dropped (`--cap-drop ALL`). |
| **Runaway cost** | Cron skill loops and burns $50 of tokens overnight | Daily spend limit in config. Per-skill token budget. Auto-pause + notification when limit reached. Container timeout hard limit. |
| **Agent goes rogue at 3am** | Cron-triggered skill does something unintended | Kill switch via Telegram (`/pause`, `/kill`). All actions logged to audit trail. Tiered approval for destructive ops. |

### Security Defaults (Zero-Config)

These apply out of the box, no configuration needed:

1. **No inbound ports** — Telegram/WhatsApp use outbound polling
2. **Sandboxed execution** — All OpenCode runs in Docker containers with `--cap-drop ALL`
3. **Scoped volumes** — Containers only see their `/workspace`, not the host filesystem
4. **No network for sandboxed containers** — `--network none` by default for `sandboxed` trust level
5. **Container timeout** — 5 minute hard limit (configurable)
6. **Memory permissions** — `700` on memory directory
7. **Secrets in env only** — Config supports `${ENV_VAR}` interpolation, never stores secrets

### Security Hardening (Optional, Recommended for P1+)

| When | Hardening | How |
|------|-----------|-----|
| Dashboard (M4) | Tailscale | `tailscale up` on VPS, access dashboard via `100.x.y.z:3000` |
| Webhooks (M5) | Tailscale Funnel | `tailscale funnel 3001` for incoming webhook traffic |
| SSH | Key-only auth | Disable password auth in `sshd_config` |
| Docker socket | Scope access | Consider Sysbox or rootless Docker for additional isolation |
| Backups | Encrypted offsite | Cron job: `tar czf - memory/ config/ | gpg -e > backup.tar.gz.gpg` |

### Documentation Strategy

The security story is a **differentiator**, not an afterthought. The docs site (docs.augure.dev) should have:

- **Security page** as a top-level navigation item (not buried in "Advanced")
- **Threat model** published openly (builds trust, invites audit)
- **"Secure by default" badge** — document what's protected without any configuration
- **Comparison with OpenClaw** — factual, not FUD. Let the architecture speak.
- **Quick start that's already secure** — No "first deploy, then harden" pattern. The default `docker compose up` is already secure.

---

## Deployment

### Docker Compose (Primary)

```yaml
services:
  augure:
    build: .
    restart: unless-stopped
    volumes:
      - ./config:/app/config:ro        # Config is read-only at runtime
      - ./memory:/app/memory            # Memory store (read-write)
      - ./logs:/app/logs                # Audit trail
      - ./skills:/app/skills            # User skills
      - /var/run/docker.sock:/var/run/docker.sock  # For container pool management
    env_file: .env                      # Secrets live here ONLY
    # No ports exposed! Telegram uses outbound polling.
    # Uncomment below for web dashboard (M4+):
    # ports:
    #   - "127.0.0.1:3000:3000"        # Localhost only, use Tailscale for remote

  # Optional: SearXNG for self-hosted search
  # searxng:
  #   image: searxng/searxng:latest
  #   restart: unless-stopped
```

Note: **no `ports:` section by default.** The agent communicates via outbound connections only. This is intentional.

### Quick Start (Secure by Default)

```bash
# 1. Clone
git clone https://github.com/FaureAlexis/augure.git
cd augure

# 2. Configure
cp .env.example .env
# Edit .env with your tokens:
#   OPENROUTER_API_KEY=sk-or-...
#   TELEGRAM_BOT_TOKEN=123456:ABC...

cp config/augure.example.json5 config/augure.json5
# Edit config with your preferences (no secrets here!)

# 3. Build sandbox image
docker build -t augure-sandbox containers/augure-sandbox/

# 4. Launch
docker compose up -d

# 5. Talk to your bot on Telegram
# That's it. No ports to open, no firewall to configure, no Tailscale needed.
```

### Minimum Requirements

- 2 vCPU / 4 GB RAM VPS (Hetzner CX22 ~€4/mo, DigitalOcean $24/mo)
- Docker + Docker Compose
- Node.js 22+ (for local development only; production runs in Docker)

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 22 + TypeScript | User expertise, async-first |
| Package manager | pnpm + Turborepo | Monorepo, fast installs |
| LLM client | OpenRouter API (OpenAI-compatible) | Provider-agnostic, single API |
| Executor | OpenCode (in Docker containers) | Universal: shell, browser, Python, code, git |
| Containers | dockerode | Docker API client for Node.js |
| Container pool | Custom (dockerode-based) | Warm pool for instant execution |
| Telegram | grammy | Best TS Telegram lib, middleware support |
| WhatsApp | @whiskeysockets/baileys | Standard for self-hosted WA bots |
| Scheduler | node-cron | Simple, no external deps |
| Config | JSON5 | Comments, trailing commas |
| Search | Tavily API / SearXNG | Paid simple option + self-hosted option |
| Documentation | Fumadocs + Next.js | Full control, MDX, hosted on Vercel |

---

## Milestones

### M0 — Skeleton (Week 1)
- [ ] Monorepo setup (pnpm workspaces + turbo)
- [ ] Core agent loop with OpenRouter
- [ ] Telegram channel (send/receive)
- [ ] Basic tool dispatch (web_search + shell)
- [ ] Docker sandbox for shell execution
- [ ] Config loader (JSON5 + env vars)
- [ ] Fumadocs site scaffolding (apps/docs)

### M1 — Memory & Proactivity (Week 2-3)
- [ ] Memory store (read/write markdown files)
- [ ] Conversation ingestion (extract facts → memory)
- [ ] Memory retrieval (inject relevant context)
- [ ] Cron scheduler with job persistence
- [ ] Heartbeat system (periodic proactive checks)
- [ ] Email tool (IMAP read + alerts)

### M2 — Skills Engine (Week 3-4)
- [ ] Skill format (skill.md + skill.ts hybrid)
- [ ] Skill generator (LLM → code in sandbox)
- [ ] Skill tester (auto-test in sandbox, retry loop)
- [ ] Skill runner (execute with SkillContext)
- [ ] Self-healer (detect failure, patch, redeploy)
- [ ] Built-in skills (daily-digest, email-triage, skill-health-check)
- [ ] Skill CLI (list, run, pause, logs)

### M3 — Browser & Coding (Week 4-5)
- [ ] Playwright sandbox container
- [ ] Browser tool (navigate, scrape, screenshot)
- [ ] Code agent sandbox (OpenCode integration)
- [ ] GitHub tool (issues, PRs)
- [ ] File operations tool

### M4 — WhatsApp & Polish (Week 5-6)
- [ ] WhatsApp channel via Baileys
- [ ] Dual-mode cost optimization (monitor/reason)
- [ ] MCP compatibility layer for tools
- [ ] Documentation site content (getting started, skills, tools, config)
- [ ] CLI polish (`augure start`, `augure status`, `augure doctor`)
- [ ] README + landing page

### M5 — Dashboard & Registry (Future)
- [ ] REST API for state/config/memory/skills
- [ ] WebSocket for real-time chat
- [ ] Web dashboard UI (React)
- [ ] Skill registry (community sharing)
- [ ] Managed hosting infrastructure

---

## CLI Interface

```bash
# Lifecycle
augure start                    # Start the agent (foreground)
augure start -d                 # Start as daemon
augure stop                     # Stop the agent
augure status                   # Show agent status, channels, active jobs

# Memory
augure memory list              # List memory files
augure memory show preferences  # Show a memory category
augure memory edit identity     # Open in $EDITOR

# Scheduler
augure jobs list                # List scheduled jobs
augure jobs add                 # Interactive job creation
augure jobs run <id>            # Trigger a job manually
augure jobs remove <id>         # Delete a job

# Channels
augure channels status          # Show connected channels
augure channels login telegram  # Link Telegram bot

# Tools
augure tools list               # List available tools
augure tools test <name>        # Test a tool

# Debug
augure doctor                   # Check config, deps, connectivity
augure logs                     # Tail agent logs
augure logs --job <id>          # Logs for a specific job run
```

---

## Naming Rationale

**Augure** — French/Latin for *"the one who predicts"* / *"oracle, diviner."* The agent anticipates your needs, acts proactively, and learns to foresee what you want. Perfect fit for the skill system's self-learning nature. Domain: **augure.dev** ($13/yr). Clean CLI: `augure start`, `augure skills`, `augure memory`.

Alternative candidates considered: Adsum, Vigil, Axon, Pulse, Kin, Daemon, Sentinelle.

---

## Resolved Decisions

1. **Memory ingestion model** — Each LLM usage (ingestion, reasoning, monitoring) has its own configurable model in config. Cheap model (e.g. gemini-flash) for ingestion/monitoring, primary model for reasoning. All configurable in `augure.json5`.
2. **State persistence** — Flat files (JSON/markdown), structured so the agent itself can read them. Migrate to SQLite only if needed later.
3. **Multi-user** — No. V0 is single-user only. Keep it simple.
4. **MCP support** — Yes. Tools should be MCP-compatible from P1 for ecosystem interoperability.
5. **License** — MIT (same as OpenClaw). Maximizes adoption, allows future managed hosting monetization.
