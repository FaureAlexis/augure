FROM node:22-slim AS base
RUN corepack enable pnpm

WORKDIR /app

# Install deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/core/package.json packages/core/
COPY packages/memory/package.json packages/memory/
COPY packages/channels/package.json packages/channels/
COPY packages/scheduler/package.json packages/scheduler/
COPY packages/tools/package.json packages/tools/
COPY packages/sandbox/package.json packages/sandbox/
COPY packages/skills/package.json packages/skills/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile

# Copy source & build
COPY tsconfig.base.json turbo.json ./
COPY packages/ packages/
RUN pnpm build

# Run
CMD ["node", "packages/cli/dist/bin.js", "start", "--config", "/app/config/augure.json5"]
