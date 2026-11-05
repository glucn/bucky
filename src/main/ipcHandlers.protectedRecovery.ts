import type { IpcRegistrar } from "./ipcSecurity";
import type { PersonalRecovery } from "./personalRecovery";

/** These channels are callable while locked; the owner validates status and authenticates each operation. */
export function setupProtectedRecoveryIpcHandlers(ipc: IpcRegistrar, getRecovery: () => PersonalRecovery | undefined) {
  const personal = () => {
    const recovery = getRecovery();
    if (!recovery) throw new Error("Protected recovery is available only in the packaged app");
    return recovery;
  };
  ipc.handle("get-protected-recovery-state", () => personal().getState());
  ipc.handle("create-protected-backup", (_event, input) => personal().createBackup(input));
  ipc.handle("begin-protected-restore", (_event, input) => personal().beginRestore(input));
  ipc.handle("begin-legacy-conversion", (_event, input) => personal().beginLegacy(input));
  ipc.handle("begin-interrupted-recovery", (_event, input) => personal().beginInterrupted(input));
  ipc.handle("confirm-protected-restore", (_event, input) => personal().confirmRestore(input));
  ipc.handle("select-protected-profile", (_event, input) => personal().selectProfile(input));
  ipc.handle("cancel-protected-recovery", () => personal().cancel());
}
