export type RetryOptions = {
  attempts?: number;
  /** Base delay in ms; the wait before retry n is delayMs * n. Use 0 in tests. */
  delayMs?: number;
};

/** Calls `fn` up to `attempts` times with an increasing delay, then rethrows the last error. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 500 }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * i));
      }
    }
  }
  throw lastError;
}
