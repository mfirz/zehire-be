/**
 * Database Utilities
 * ==================
 * Shared utilities for database operations.
 */

/**
 * Check if an error is a D1/SQLite lock error.
 */
function isDbLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("1031") ||
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("Database busy")
  );
}

/**
 * Retry a database operation with exponential backoff + jitter.
 * Handles D1 lock contention in local dev and production edge cases.
 *
 * Uses 5 retries with 150ms base delay to handle "cold start" scenarios
 * where DB needs time to wake up after being idle.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 150;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on lock errors
      if (!isDbLockError(error) || attempt >= maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter to desynchronize concurrent retries
      const baseDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay * 0.5; // 0-50% jitter
      const delay = Math.round(baseDelay + jitter);
      console.log(`[DB] Lock detected, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
