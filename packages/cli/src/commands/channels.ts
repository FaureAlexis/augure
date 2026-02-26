import { defineCommand } from "citty";
import { resolve } from "node:path";
import { loadConfig } from "@augure/core";
import { prefix, ok, err, dim, bold } from "../colors.js";

const configArg = {
  type: "string" as const,
  description: "Path to config file",
  alias: "c",
  default: "./augure.json5",
};

const statusSubCommand = defineCommand({
  meta: { name: "status", description: "Show channel status" },
  args: { config: configArg },
  async run({ args }) {
    const configPath = resolve(args.config);
    const config = await loadConfig(configPath);

    console.log(`${prefix} ${bold("channels")}\n`);

    // Telegram
    const tgEnabled = config.channels.telegram?.enabled ?? false;
    if (tgEnabled) {
      const token = config.channels.telegram!.botToken;
      try {
        const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { result?: { username?: string } };
          console.log(`  ${ok("✓")} Telegram: enabled (@${data.result?.username ?? "unknown"})`);
        } else {
          console.log(`  ${err("✗")} Telegram: enabled (HTTP ${resp.status})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ${err("✗")} Telegram: enabled (${msg})`);
      }
    } else {
      console.log(`  ${dim("○")} Telegram: disabled`);
    }

    // WhatsApp
    const waEnabled = config.channels.whatsapp?.enabled ?? false;
    console.log(`  ${waEnabled ? ok("✓") : dim("○")} WhatsApp: ${waEnabled ? "enabled" : "disabled"}`);

    // Web
    const webEnabled = config.channels.web?.enabled ?? false;
    if (webEnabled) {
      console.log(`  ${ok("✓")} Web: enabled (port ${config.channels.web!.port})`);
    } else {
      console.log(`  ${dim("○")} Web: disabled`);
    }

    console.log("");
  },
});

export const channelsCommand = defineCommand({
  meta: { name: "channels", description: "Manage channels" },
  subCommands: {
    status: statusSubCommand,
  },
});
