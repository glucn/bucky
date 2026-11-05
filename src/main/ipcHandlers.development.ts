import type { IpcRegistrar } from "./ipcSecurity";
import { parseResetRequest, type ResetRequest } from "../shared/reset";

export function setupDevelopmentIpcHandlers(ipc: IpcRegistrar, database: { resetAllData(request: ResetRequest): Promise<void> }) {
  // The shared registrar rejects this channel in packaged mode. The service also
  // independently refuses personal storage; this handler never bypasses either guard.
  ipc.handle("reset-all-data", async (_event, request: unknown) => {
    try {
      await database.resetAllData(parseResetRequest(request));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unable to reset development data" };
    }
  });
}
