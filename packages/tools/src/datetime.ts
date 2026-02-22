import type { NativeTool } from "@augure/types";

export const datetimeTool: NativeTool = {
  name: "datetime",
  description:
    "Get the current date and time, optionally in a specific timezone",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description:
          "IANA timezone (e.g. 'Europe/Paris', 'America/New_York'). Defaults to the system timezone.",
      },
    },
  },
  execute: async (params) => {
    const { timezone } = params as { timezone?: string };
    const now = new Date();

    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "longOffset",
    };

    if (timezone) {
      options.timeZone = timezone;
    }

    try {
      const formatted = new Intl.DateTimeFormat("en-US", options).format(now);
      return {
        success: true,
        output: `${formatted}\nISO 8601 (UTC): ${now.toISOString()}\nUnix timestamp: ${Math.floor(now.getTime() / 1000)}`,
      };
    } catch {
      return { success: false, output: `Invalid timezone: ${timezone}` };
    }
  },
};
