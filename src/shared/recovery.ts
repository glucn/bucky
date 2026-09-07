export type RecoverySummary = {
  schemaVersion: string;
  recordDigest: string;
  tableCounts: Record<string, number>;
  /** Raw journal signs, grouped by posting currency; not converted net worth. */
  balances: Array<{ accountId: string; currency: string; amount: number }>;
};

export type RecoveryResult = { path: string; summary: RecoverySummary; profileId?: string };
export type RecoveryResponse<T> = { success: true; data: T } | { success: false; error: string } | { success: false; canceled: true };
export type RecoveryState = {
  available: boolean;
  activeProfile: string;
  nextProfile: string;
  profiles: Array<{ id: string }>;
};
