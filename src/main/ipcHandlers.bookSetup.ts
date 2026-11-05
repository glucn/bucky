import type { IpcRegistrar } from "./ipcSecurity";
import { bookSetupService } from "../services/bookSetup";

export function setupBookSetupIpcHandlers(ipc: IpcRegistrar) {
  ipc.handle("get-book-setup-state", () => bookSetupService.getState());
  ipc.handle("complete-book-setup", async (_event, input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 ||
      !Object.hasOwn(input, "baseCurrency") || typeof (input as any).baseCurrency !== "string") throw new Error("Choose a supported base currency");
    await bookSetupService.complete((input as { baseCurrency: string }).baseCurrency);
  });
}
