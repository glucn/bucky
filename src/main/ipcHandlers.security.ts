import type { IpcRegistrar } from "./ipcSecurity";
import type { PersonalSecurity } from "./personalSecurity";
import type { SecurityState } from "../shared/security";

export function setupSecurityIpcHandlers(ipc: IpcRegistrar, getSecurity: () => PersonalSecurity | undefined) {
  const personal = () => {
    const security = getSecurity();
    if (!security) throw new Error("Personal security operations are unavailable in development");
    return security;
  };
  ipc.handle("get-security-state", (): SecurityState => getSecurity()?.getState() ?? {
    status: "unlocked", personal: false, revision: 0, osAuthenticationAvailable: false,
    methods: { keychain: false, passphrase: false },
  });
  ipc.handle("begin-protected-setup", (_event, input) => personal().beginSetup(input));
  ipc.handle("confirm-protected-setup", (_event, input) => personal().confirmSetup(input));
  ipc.handle("unlock-personal-profile", (_event, input) => personal().unlock(input));
  ipc.handle("lock-personal-profile", () => personal().lock());
  ipc.handle("preserve-interrupted-setup", (_event, input) => personal().preserveSetup(input));
  ipc.handle("change-profile-credentials", (_event, input) => personal().changeCredentials(input));
}
