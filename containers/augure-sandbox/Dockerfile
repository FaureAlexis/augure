FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    curl jq git ripgrep \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
