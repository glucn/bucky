export type SecurityStatus = "initializing" | "setup-required" | "setting-up" | "confirm-recovery"
  | "locked" | "unlocking" | "unlocked" | "locking" | "recovery-required" | "recovering" | "changing-credentials";
export type SecurityState = {
  status: SecurityStatus;
  revision: number;
  personal: boolean;
  osAuthenticationAvailable: boolean;
  methods: { keychain: boolean; passphrase: boolean };
  reason?: string;
};
export type SetupRequest = { baseCurrency: string; mode: "keychain" | "passphrase";
  passphrase?: string; passphraseConfirmation?: string };
export type CredentialChangeRequest = {
  authentication: { mode: "keychain" } | { mode: "passphrase"; passphrase: string } | { mode: "recovery"; recoverySecret: string };
  change: { mode: "keychain" } | { mode: "passphrase"; passphrase: string; passphraseConfirmation: string };
};
export interface SecurityApi {
  getState(): Promise<SecurityState>;
  beginSetup(input: SetupRequest): Promise<{ setupId: string; recoverySecret: string }>;
  confirmSetup(input: { setupId: string; recoverySecret: string }): Promise<void>;
  unlock(input: { mode: "keychain" | "passphrase"; passphrase?: string }): Promise<void>;
  lock(): Promise<void>;
  preserveSetup(input: { artifactIds: string[] }): Promise<import("./recovery").SetupPreservationResult>;
  changeCredentials(input: CredentialChangeRequest): Promise<{ updated: boolean }>;
  onStateChanged(listener: (state: SecurityState) => void): () => void;
}
