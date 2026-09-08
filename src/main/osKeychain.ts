import { safeStorage } from "electron";
import type { KeychainProtector } from "../services/profileKeys";

/** Only the packaged macOS target is validated. This protects key material; it does
 * not perform the separate OS/user authentication required by the launch lock. */
export function createOsKeychain(platform: NodeJS.Platform = process.platform): KeychainProtector {
  const isAvailable = () => platform === "darwin" && safeStorage.isEncryptionAvailable();
  return {
    isAvailable,
    async encryptString(value) {
      if (!isAvailable()) throw new Error("OS keychain is unavailable");
      return safeStorage.encryptString(value);
    },
    async decryptString(value) {
      if (!isAvailable()) throw new Error("OS keychain is unavailable");
      return safeStorage.decryptString(value);
    },
  };
}
