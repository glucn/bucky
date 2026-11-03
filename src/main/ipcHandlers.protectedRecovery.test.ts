import { expect, it, vi } from "vitest";
import { createSecureIpc } from "./ipcSecurity";
import { setupProtectedRecoveryIpcHandlers } from "./ipcHandlers.protectedRecovery";

it("allows reviewed recovery operations while locked but rejects other windows and frames before calling the owner", async () => {
  const handlers = new Map<string, any>();
  const frame = { url: "file:///app/index.html" };
  const event = { sender: { id: 1 }, senderFrame: frame };
  const owner = { getState: vi.fn(async () => ({ available: true })), beginRestore: vi.fn(async () => ({ restoreId: "pending" })), cancel: vi.fn() };
  const secure = createSecureIpc({ handle: (channel: string, action: any) => handlers.set(channel, action), removeHandler: vi.fn() } as any,
    { getWindow: () => ({ webContents: { id: 1, mainFrame: frame } }) as any,
      getAppUrl: () => frame.url, isPackaged: () => true });
  setupProtectedRecoveryIpcHandlers(secure, () => owner as any);
  expect(await handlers.get("get-protected-recovery-state")(event)).toEqual({ available: true });
  const input = { credential: { mode: "recovery", secret: "secret" } };
  await handlers.get("begin-protected-restore")(event, input);
  expect(owner.beginRestore).toHaveBeenCalledWith(input);
  await expect(handlers.get("begin-protected-restore")({ ...event, senderFrame: { ...frame } }, input)).rejects.toThrow(/unauthorized/i);
  await expect(handlers.get("cancel-protected-recovery")({ ...event, sender: { id: 2 } })).rejects.toThrow(/unauthorized/i);
  expect(owner.beginRestore).toHaveBeenCalledTimes(1);
  expect(owner.cancel).not.toHaveBeenCalled();
});
