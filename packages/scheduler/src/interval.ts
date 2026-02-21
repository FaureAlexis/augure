const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

export function parseInterval(input: string): number {
  const match = input.match(/^(\d+)([smh])$/);
  if (!match) {
    throw new Error(
      `Invalid interval format: "${input}". Expected: <number><s|m|h> (e.g. "30m")`,
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (value <= 0) {
    throw new Error(`Interval must be positive, got: ${value}`);
  }

  return value * UNITS[unit];
}
