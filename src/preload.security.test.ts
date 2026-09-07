import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), on: vi.fn(), expose: vi.fn() }));
vi.mock("electron", () => ({ ipcRenderer: { invoke: mocks.invoke, on: mocks.on },
  contextBridge: { exposeInMainWorld: mocks.expose } }));
describe("Preload channel boundary", () => {
  let api: any;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    await import("./preload");
    api = mocks.expose.mock.calls[0][1];
  });
  it("rejects unknown channels without invoking Electron", async () => {
    await expect(api.ipcRenderer.invoke("arbitrary-shell", "private input")).rejects.toThrow(/channel/i);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not expose arbitrary event subscriptions", () => {
    expect(api.ipcRenderer.on).toBeUndefined();
  });
  it("preserves reviewed legacy channel calls", async () => {
    mocks.invoke.mockResolvedValue([{ id: "cash" }]);
    expect(await api.ipcRenderer.invoke("get-accounts", true)).toEqual([{ id: "cash" }]);
    expect(mocks.invoke).toHaveBeenCalledWith("get-accounts", true);
  });
});
