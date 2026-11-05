import { describe, expect, it, vi } from "vitest";
import { createSecureIpc, isApplicationUrl, protectWindow, applicationContentSecurityPolicy } from "./ipcSecurity";

const packagedUrl = "file:///Applications/Bucky.app/Contents/Resources/app.asar/.webpack/renderer/main_window/index.html";
function fixture(packaged = true) {
  const handlers = new Map<string, any>();
  const frame = { url: packaged ? packagedUrl : "http://localhost:3000/accounts" };
  const owner = { webContents: { id: 7, mainFrame: frame } };
  const transport = { handle: (channel: string, handler: any) => handlers.set(channel, handler), removeHandler: vi.fn() };
  const secure = createSecureIpc(transport as any, { getWindow: () => owner as any,
    isPackaged: () => packaged, getAppUrl: () => packaged ? packagedUrl : "http://localhost:3000",
    runData: (action) => action() });
  return { secure, handlers, frame, event: { sender: { id: 7 }, senderFrame: frame } };
}

describe("Main-process IPC security", () => {
  it.each([true, false])("passes the channel through the book gate in packaged=%s mode", async (packaged) => {
    const handlers = new Map<string, any>(), action = vi.fn(), runData = vi.fn().mockRejectedValue(new Error("Choose a base currency"));
    const frame = { url: packaged ? packagedUrl : "http://localhost:3000" };
    const secure = createSecureIpc({ handle: (name: string, handler: any) => handlers.set(name, handler) } as any,
      { getWindow: () => ({ webContents: { id: 1, mainFrame: frame } }) as any, getAppUrl: () => frame.url, isPackaged: () => packaged, runData });
    secure.handle("get-accounts", action);
    await expect(handlers.get("get-accounts")({ sender: { id: 1 }, senderFrame: frame })).rejects.toThrow(/base currency/i);
    expect(action).not.toHaveBeenCalled(); expect(runData).toHaveBeenCalledWith(expect.any(Function), "get-accounts");
  });
  it("requires the personal lock gate even for an authorized application frame", async () => {
    const handlers = new Map<string, any>();
    const frame = { url: packagedUrl };
    const event = { sender: { id: 1 }, senderFrame: frame };
    const action = vi.fn();
    const secure = createSecureIpc({ handle: (c: string, fn: any) => handlers.set(c, fn), removeHandler: vi.fn() } as any,
      { getWindow: () => ({ webContents: { id: 1, mainFrame: frame } }) as any, getAppUrl: () => packagedUrl, isPackaged: () => true });
    secure.handle("get-accounts", action);
    await expect(handlers.get("get-accounts")(event)).rejects.toThrow(/locked/i);
    expect(action).not.toHaveBeenCalled();
    secure.handle("get-security-state", () => ({ status: "locked" }));
    expect(await handlers.get("get-security-state")(event)).toEqual({ status: "locked" });
  });
  it("delegates authorized requests, including packaged hash routes", async () => {
    const { secure, handlers, frame, event } = fixture();
    const action = vi.fn().mockResolvedValue(["records"]);
    secure.handle("get-accounts", action);
    frame.url += "#/accounts";
    expect(await handlers.get("get-accounts")(event, true)).toEqual(["records"]);
    expect(action).toHaveBeenCalledWith(event, true);
  });
  it.each(["other-window", "subframe", "missing-frame", "remote", "sibling-file"])("rejects %s before accessing services", async (kind) => {
    const { secure, handlers, frame, event } = fixture();
    const action = vi.fn();
    secure.handle("add-account", action);
    const request: any = { ...event };
    if (kind === "other-window") request.sender = { id: 99 };
    if (kind === "subframe") request.senderFrame = { ...frame };
    if (kind === "missing-frame") request.senderFrame = null;
    if (kind === "remote") frame.url = "https://example.com";
    if (kind === "sibling-file") frame.url = packagedUrl.replace("index.html", "evil.html");
    await expect(handlers.get("add-account")(request, { name: "private" })).rejects.toThrow(/unauthorized/i);
    expect(action).not.toHaveBeenCalled();
  });
  it.each(["reset-all-data", "seed-enrichment-run-summary"])("denies packaged %s regardless of inherited test flags", async (channel) => {
    const { secure, handlers, event } = fixture();
    const action = vi.fn();
    secure.handle(channel, action);
    await expect(handlers.get(channel)(event)).rejects.toThrow(/development-only/i);
    expect(action).not.toHaveBeenCalled();
  });
  it("retains development/test reset access for the trusted development window", async () => {
    const { secure, handlers, event } = fixture(false);
    const action = vi.fn().mockResolvedValue({ success: true });
    secure.handle("reset-all-data", action);
    expect(await handlers.get("reset-all-data")(event)).toEqual({ success: true });
  });
  it("refuses registration of channels that have not been reviewed", () => {
    expect(() => fixture().secure.handle("arbitrary-shell", vi.fn())).toThrow(/channel/i);
  });
});

describe("Window navigation policy", () => {
  it("prohibits renderer networking, frames, and evaluated scripts in production while allowing development hot reload", () => {
    const policy = applicationContentSecurityPolicy(true);
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("http:");
    expect(applicationContentSecurityPolicy(false)).toContain("unsafe-eval");
  });
  it("compares exact packaged documents, not file origins or path prefixes", () => {
    expect(isApplicationUrl(packagedUrl + "#/settings", packagedUrl, true)).toBe(true);
    for (const url of [packagedUrl + "?remote=1", packagedUrl + "/extra", "file:///tmp/index.html", "data:text/html,evil", "https://localhost:3000", "invalid"]) {
      expect(isApplicationUrl(url, packagedUrl, true)).toBe(false);
    }
    expect(isApplicationUrl("http://localhost:3000/accounts", "http://localhost:3000", false)).toBe(true);
    expect(isApplicationUrl("http://localhost:3000.evil.test", "http://localhost:3000", false)).toBe(false);
  });
  it("denies popups, external navigation, permissions, and webview attachment", () => {
    const listeners = new Map<string, any>();
    const webContents = { on: (name: string, fn: any) => listeners.set(name, fn),
      setWindowOpenHandler: vi.fn(), session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() } };
    protectWindow({ webContents } as any, packagedUrl, true);
    expect(webContents.setWindowOpenHandler.mock.calls[0][0]({ url: "https://example.com" })).toEqual({ action: "deny" });
    for (const name of ["will-navigate", "will-redirect", "will-attach-webview"]) {
      const event = { preventDefault: vi.fn() };
      listeners.get(name)(event, "https://example.com");
      expect(event.preventDefault).toHaveBeenCalled();
    }
    expect(webContents.session.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false);
    const callback = vi.fn();
    webContents.session.setPermissionRequestHandler.mock.calls[0][0](null, "camera", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });
});
