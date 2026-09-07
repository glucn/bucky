import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupRecoveryIpcHandlers } from "./ipcHandlers.recovery";

const mocks = vi.hoisted(() => ({ handlers: new Map<string, any>(), open: vi.fn(), confirm: vi.fn(),
  backup: vi.fn(), restore: vi.fn(), select: vi.fn(), list: vi.fn(), context: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: {
  handle: (name: string, callback: any) => mocks.handlers.set(name, callback), removeHandler: vi.fn(),
}, dialog: { showOpenDialog: mocks.open, showMessageBox: mocks.confirm } }));
vi.mock("../services/database", () => ({ databaseService: { getRecoveryContext: mocks.context } }));
vi.mock("../services/backupRecovery", () => ({ createBackup: mocks.backup, restoreBackup: mocks.restore,
  selectProfile: mocks.select, listProfiles: mocks.list }));
vi.mock("../services/personalProfiles", () => ({ readActiveProfile: () => "default" }));

const frame = {};
const owner = { webContents: { id: 1, mainFrame: frame } };
const event = { sender: { id: 1 }, senderFrame: frame };
describe("Recovery IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockReturnValue({ userData: "/personal", databaseFile: "/personal/profiles/default/book.sqlite", migrations: "/migrations", activeProfile: "default" });
    setupRecoveryIpcHandlers(() => owner as any);
  });
  it("cancels without creating or restoring files", async () => {
    mocks.open.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await mocks.handlers.get("create-personal-backup")(event)).toEqual({ success: false, canceled: true });
    expect(await mocks.handlers.get("restore-personal-backup")(event)).toEqual({ success: false, canceled: true });
    expect(mocks.backup).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
  it("ignores renderer-supplied filesystem paths and uses the native picker", async () => {
    mocks.open.mockResolvedValue({ canceled: false, filePaths: ["/chosen"] });
    mocks.backup.mockResolvedValue({ path: "/chosen/book.sqlite" });
    await mocks.handlers.get("create-personal-backup")(event, "/untrusted/overwrite.sqlite");
    expect(mocks.backup).toHaveBeenCalledWith("/personal/profiles/default/book.sqlite", expect.stringMatching(/^\/chosen\/bucky-v1-.*\.sqlite$/), "/migrations");
  });
  it("rejects other windows and subframes before opening dialogs", async () => {
    const result = await mocks.handlers.get("create-personal-backup")({ ...event, senderFrame: {} });
    expect(result.success).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("requires native confirmation before changing next-launch profile", async () => {
    mocks.confirm.mockResolvedValue({ response: 0 });
    expect(await mocks.handlers.get("select-personal-profile")(event, "restored-valid"))
      .toEqual({ success: false, canceled: true });
    expect(mocks.select).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue({ response: 1 });
    await mocks.handlers.get("select-personal-profile")(event, "restored-valid");
    expect(mocks.select).toHaveBeenCalledWith("/personal", "restored-valid", "/migrations");
  });
  it("disallows recovery operations on development/test storage", async () => {
    mocks.context.mockReturnValue(null);
    expect((await mocks.handlers.get("restore-personal-backup")(event)).success).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("serializes operations and returns service failures without false success", async () => {
    let finish!: (value: unknown) => void;
    mocks.open.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = mocks.handlers.get("create-personal-backup")(event);
    expect((await mocks.handlers.get("restore-personal-backup")(event)).success).toBe(false);
    mocks.backup.mockRejectedValue(new Error("Disk full"));
    finish({ canceled: false, filePaths: ["/chosen"] });
    expect(await first).toEqual({ success: false, error: "Disk full" });
  });
});
