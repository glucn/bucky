import { describe, expect, it, vi } from "vitest";
import { withTransientRetry } from "./enrichmentRetry";

describe("withTransientRetry", () => {
  it("retries transient failures and then succeeds", async () => {
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("Rate limited") as Error & { status?: number };
        error.status = 429;
        throw error;
      }
      return "ok";
    });

    const result = await withTransientRetry(operation, {
      maxRetries: 2,
      initialDelayMs: 1,
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient failures", async () => {
    const operation = vi.fn(async () => {
      throw new Error("Validation failed");
    });

    await expect(
      withTransientRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 1,
      })
    ).rejects.toThrow("Validation failed");

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
