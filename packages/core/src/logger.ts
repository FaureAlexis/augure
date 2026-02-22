import { styleText } from "node:util";
import type { Logger, LogLevel } from "@augure/types";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function tag(level: "debug" | "info" | "warn" | "error"): string {
  switch (level) {
    case "debug":
      return styleText("magenta", "DBG");
    case "info":
      return styleText("cyan", "INF");
    case "warn":
      return styleText("yellow", "WRN");
    case "error":
      return styleText("red", "ERR");
  }
}

export interface CreateLoggerOptions {
  level?: LogLevel;
  scope?: string;
}

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const min = LEVELS[opts.level ?? "info"];
  const scope = opts.scope;

  function emit(
    level: "debug" | "info" | "warn" | "error",
    msg: string,
    args: unknown[],
  ): void {
    if (LEVELS[level] < min) return;

    const ts = styleText("dim", new Date().toISOString().slice(11, 23));
    const lvl = tag(level);
    const sc = scope ? ` ${styleText("dim", scope)}` : "";
    const prefix = `${styleText("yellow", "▲")} ${ts} ${lvl}${sc}`;
    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;

    if (args.length > 0) {
      fn(prefix, msg, ...args);
    } else {
      fn(prefix, msg);
    }
  }

  return {
    debug: (msg, ...args) => emit("debug", msg, args),
    info: (msg, ...args) => emit("info", msg, args),
    warn: (msg, ...args) => emit("warn", msg, args),
    error: (msg, ...args) => emit("error", msg, args),
    child: (childScope) =>
      createLogger({
        level: opts.level,
        scope: scope ? `${scope}:${childScope}` : childScope,
      }),
  };
}
