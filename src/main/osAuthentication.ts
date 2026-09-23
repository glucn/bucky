import { systemPreferences } from "electron";

/** No keychain retrieval or silent fallback here: successful Touch ID is a separate challenge. */
export function createOsAuthentication(platform: NodeJS.Platform = process.platform) {
  const available = () => platform === "darwin" && systemPreferences.canPromptTouchID();
  return { available, async authenticate() {
    if (!available()) throw new Error("OS authentication is unavailable");
    await systemPreferences.promptTouchID("unlock your Bucky bookkeeping profile");
  } };
}
export const osAuthentication = createOsAuthentication();
