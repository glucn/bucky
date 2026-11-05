export type RecoverySummary = {
  schemaVersion: string;
  recordDigest: string;
  tableCounts: Record<string, number>;
  /** Raw journal signs, grouped by posting currency; not converted net worth. */
  balances: Array<{ accountId: string; currency: string; amount: number }>;
};

export type RecoveryResult = { path: string; summary: RecoverySummary; profileId?: string };
export type InterruptedArtifact = { id: string; kind: "setup" | "restore" | "temporary" | "lock";
  canAttemptRecovery: boolean; profileId?: string; preserved?: true };
export type RecoveryResponse<T> = { success: true; data: T } | { success: false; error: string } | { success: false; canceled: true };
export type RecoveryState = {
  available: boolean;
  activeProfile: string;
  nextProfile: string;
  profiles: Array<{ id: string }>;
};

export type ProfileAuthentication = { mode: "keychain" | "passphrase"; passphrase?: string };
export type ProtectedRestoreRequest = { credential: { mode: "recovery" | "passphrase"; secret: string };
  protection: ProfileAuthentication & { passphraseConfirmation?: string } };
export type LegacyConversionRequest = { acknowledgePlaintext: boolean; protection: ProtectedRestoreRequest["protection"] };
export type PendingProtectedRestore = { restoreId: string; profileId: string; recoverySecret: string; summary: RecoverySummary };
export interface ProtectedRecoveryApi {
  getState(): Promise<RecoveryState>;
  createBackup(input: ProfileAuthentication): Promise<RecoveryResult | undefined>;
  beginRestore(input: ProtectedRestoreRequest): Promise<PendingProtectedRestore | undefined>;
  beginLegacy(input: LegacyConversionRequest): Promise<PendingProtectedRestore | undefined>;
  confirmRestore(input: { restoreId: string; recoverySecret: string }): Promise<{ profileId: string; summary: RecoverySummary }>;
  selectProfile(input: { profileId: string; authentication: ProfileAuthentication }): Promise<boolean>;
  cancel(): Promise<void>;
}
