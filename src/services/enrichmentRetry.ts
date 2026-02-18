type RetryOptions = {
  maxRetries: number;
  initialDelayMs: number;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isTransientError = (error: unknown): boolean => {
  const status = (error as { status?: number } | undefined)?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : "";

  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("rate") ||
    message.includes("network")
  );
};

export const withTransientRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> => {
  let attempt = 0;
  let delayMs = options.initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientError(error) || attempt >= options.maxRetries) {
        throw error;
      }

      attempt += 1;
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
};
