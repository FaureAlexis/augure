FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip curl jq git ripgrep \
    && npx playwright install-deps chromium \
    && npx playwright install chromium \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
