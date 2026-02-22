export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status;
    // Retry on rate limit (429) and server errors (5xx)
    if (status === 429 || (status !== undefined && status >= 500)) return true;
    // Don't retry client errors (400-499 except 429)
    if (status !== undefined && status >= 400 && status < 500) return false;
    // Retry on network errors (no status code)
    return true;
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === options.maxRetries) {
        throw err;
      }

      const delay = options.baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
