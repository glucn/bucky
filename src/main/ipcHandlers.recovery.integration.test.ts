import { ipcMain } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { setupRecoveryIpcHandlers } from "./ipcHandlers.recovery";
import { closeSqlite, executeSql, initializePersonalDatabase, openSqlite, resolveDatabaseFile } from "../services/localDatabase";

const mocks = vi.hoisted(() => ({ handlers: new Map<string, any>(), open: vi.fn(), context: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: {
  handle: (name: string, callback: any) => mocks.handlers.set(name, callback), removeHandler: vi.fn(),
}, dialog: { showOpenDialog: mocks.open, showMessageBox: vi.fn().mockResolvedValue({ response: 1 }) } }));
vi.mock("../services/database", () => ({ databaseService: { getRecoveryContext: mocks.context } }));

describe("Recovery IPC with real SQLite storage", () => {
  let directory: string;
  let book: string;
  const frame = {};
  const event = { sender: { id: 1 }, senderFrame: frame };
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-recovery-ipc-"));
    book = path.join(directory, "profiles/default/book.sqlite");
    const migrations = path.resolve("prisma/migrations");
    await initializePersonalDatabase(book, migrations);
    const db = await openSqlite(book);
    try { await executeSql(db, `INSERT INTO Account(id,name,type,subtype,currency,updatedAt)
      VALUES ('ipc-cash','IPC cash','user','asset','CAD',CURRENT_TIMESTAMP)`); }
    finally { await closeSqlite(db); }
    mocks.context.mockReturnValue({ userData: directory, databaseFile: book, migrations, activeProfile: "default" });
    setupRecoveryIpcHandlers(() => ({ webContents: { id: 1, mainFrame: frame } }) as any, ipcMain);
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  it("exports, restores, compares contents, selects for restart, and preserves the original through the real handlers", async () => {
    // Only native OS dialogs and the process storage context are substituted.
    mocks.open.mockResolvedValueOnce({ canceled: false, filePaths: [directory] });
    const saved = await mocks.handlers.get("create-personal-backup")(event);
    expect(saved.success).toBe(true);
    expect(saved.data.summary.tableCounts.Account).toBe(1);
    mocks.open.mockResolvedValueOnce({ canceled: false, filePaths: [saved.data.path] });
    const restored = await mocks.handlers.get("restore-personal-backup")(event);
    expect(restored.success).toBe(true);
    expect(restored.data.summary).toEqual(saved.data.summary);
    let state = await mocks.handlers.get("get-recovery-state")(event);
    expect(state.data.activeProfile).toBe("default");
    expect(state.data.nextProfile).toBe("default");
    expect(state.data.profiles).toContainEqual({ id: restored.data.profileId });
    expect((await mocks.handlers.get("select-personal-profile")(event, restored.data.profileId)).success).toBe(true);
    state = await mocks.handlers.get("get-recovery-state")(event);
    expect(state.data.activeProfile).toBe("default");
    expect(state.data.nextProfile).toBe(restored.data.profileId);
    expect(resolveDatabaseFile({ isPackaged: true, userData: directory, cwd: "/elsewhere", env: {} }))
      .toBe(restored.data.path);
    expect(await fs.stat(book)).toBeTruthy();
  });
});
