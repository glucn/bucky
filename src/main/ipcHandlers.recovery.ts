import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "path";
import { randomUUID } from "crypto";
import { databaseService } from "../services/database";
import { createBackup, restoreBackup, listProfiles, selectProfile } from "../services/backupRecovery";
import { readActiveProfile } from "../services/personalProfiles";

export function setupRecoveryIpcHandlers(getWindow: () => BrowserWindow | null) {
  let busy = false;
  const register = (channel: string, action: (owner: BrowserWindow, value: unknown) => Promise<unknown>) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, value: unknown) => {
      const owner = getWindow();
      if (!owner || event.sender.id !== owner.webContents.id || event.senderFrame !== owner.webContents.mainFrame) {
        return { success: false, error: "Recovery is only available from the main application window" };
      }
      if (busy) return { success: false, error: "Another recovery operation is in progress" };
      busy = true;
      try { return await action(owner, value); }
      catch (error) { return { success: false, error: error instanceof Error ? error.message : "Recovery operation failed" }; }
      finally { busy = false; }
    });
  };
  const context = () => {
    const storage = databaseService.getRecoveryContext();
    if (!storage) throw new Error("Personal recovery is only available in the packaged app");
    return storage;
  };
  register("get-recovery-state", async () => {
    const storage = databaseService.getRecoveryContext();
    return { success: true, data: storage ? {
      available: true, activeProfile: storage.activeProfile, nextProfile: readActiveProfile(storage.userData),
      profiles: await listProfiles(storage.userData),
    } : { available: false, activeProfile: "", nextProfile: "", profiles: [] } };
  });
  register("create-personal-backup", async (owner) => {
    const storage = context();
    const chosen = await dialog.showOpenDialog(owner, {
      title: "Choose a backup folder (backups are not encrypted)",
      properties: ["openDirectory", "createDirectory"],
    });
    if (chosen.canceled || !chosen.filePaths[0]) return { success: false, canceled: true };
    const filename = `bucky-v1-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.sqlite`;
    const data = await createBackup(storage.databaseFile, path.join(chosen.filePaths[0], filename), storage.migrations);
    return { success: true, data };
  });
  register("restore-personal-backup", async (owner) => {
    const storage = context();
    const chosen = await dialog.showOpenDialog(owner, {
      title: "Restore backup into a separate profile", properties: ["openFile"],
      filters: [{ name: "Bucky SQLite backup", extensions: ["sqlite", "db"] }],
    });
    if (chosen.canceled || !chosen.filePaths[0]) return { success: false, canceled: true };
    return { success: true, data: await restoreBackup(chosen.filePaths[0], storage.userData, storage.migrations) };
  });
  register("select-personal-profile", async (owner, id) => {
    const storage = context();
    if (typeof id !== "string" || !/^(default|restored-[a-zA-Z0-9-]+)$/.test(id)) throw new Error("Invalid personal profile");
    const answer = await dialog.showMessageBox(owner, {
      type: "warning", title: "Change profile on next launch?", buttons: ["Cancel", "Use on next launch"],
      defaultId: 0, cancelId: 0, noLink: true,
      message: `Use ${id} after you quit and reopen Bucky?`,
      detail: "The current book will remain on disk. Until you quit, edits still apply to the current book. Finish or cancel any unsaved work first.",
    });
    if (answer.response !== 1) return { success: false, canceled: true };
    await selectProfile(storage.userData, id, storage.migrations);
    return { success: true, data: { nextProfile: id } };
  });
}
