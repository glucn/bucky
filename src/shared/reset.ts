export type ResetRequest = { mode: "data" | "factory" };

export function parseResetRequest(input: unknown): ResetRequest {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 ||
    !Object.hasOwn(input, "mode") || !["data", "factory"].includes((input as ResetRequest).mode)) {
    throw new Error("An explicit reset mode is required");
  }
  return { mode: (input as ResetRequest).mode };
}
