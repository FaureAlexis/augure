import { defineCommand } from "citty";
import { resolve } from "node:path";
import { prefix, ok, err, bold } from "../colors.js";

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Check configuration and connectivity",
  },
  args: {
    config: {
      type: "string",
      description: "Path to config file",
      alias: "c",
      default: "./augure.json5",
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    console.log(`${prefix} ${bold("doctor")}\n`);

    let config: import("@augure/types").AppConfig | undefined;

    // 1. Config validation
    try {
      const { loadConfig } = await import("@augure/core");
      config = await loadConfig(configPath);
      console.log(`  ${ok("✓")} Config valid`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ${err("✗")} Config invalid: ${msg}`);
    }

    // 2. Docker connectivity
    try {
      const Dockerode = (await import("dockerode")).default;
      const docker = new Dockerode();
      await docker.ping();
      console.log(`  ${ok("✓")} Docker connected`);
    } catch {
      console.log(`  ${err("✗")} Docker not reachable`);
    }

    // 3. LLM connectivity
    if (config) {
      const { provider, apiKey } = config.llm.default;
      const baseUrls: Record<string, string> = {
        openrouter: "https://openrouter.ai/api/v1",
        anthropic: "https://api.anthropic.com/v1",
        openai: "https://api.openai.com/v1",
      };
      const baseUrl = baseUrls[provider] ?? baseUrls.openrouter;
      try {
        const resp = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) {
          console.log(`  ${ok("✓")} LLM reachable (${provider})`);
        } else {
          console.log(`  ${err("✗")} LLM returned HTTP ${resp.status} (${provider})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ${err("✗")} LLM not reachable (${provider}): ${msg}`);
      }
    } else {
      console.log(`  ${err("✗")} LLM: skipped (config invalid)`);
    }

    // 4. Telegram connectivity
    if (config?.channels.telegram?.enabled) {
      const token = config.channels.telegram.botToken;
      try {
        const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { result?: { username?: string } };
          console.log(`  ${ok("✓")} Telegram bot connected (@${data.result?.username ?? "unknown"})`);
        } else {
          console.log(`  ${err("✗")} Telegram returned HTTP ${resp.status}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ${err("✗")} Telegram not reachable: ${msg}`);
      }
    } else {
      console.log(`  ${ok("✓")} Telegram: not enabled (skipped)`);
    }

    console.log("");
  },
});
