import type { BrowserWindow, IpcMain } from "electron";
import { DEVELOPMENT_ONLY_CHANNELS, isAppIpcChannel } from "../shared/ipcChannels";

export type IpcRegistrar = Pick<IpcMain, "handle" | "removeHandler">;

export function applicationContentSecurityPolicy(packaged: boolean): string {
  if (packaged) return ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "font-src 'self' data:", "connect-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-src 'none'"].join("; ");
  // Webpack development uses evaluated scripts and a local websocket for hot reload.
  return ["default-src 'self' 'unsafe-inline' 'unsafe-eval' data: ws: wss: http: https:",
    "connect-src 'self' ws: wss: http: https:", "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:", "font-src 'self' data: https:"].join("; ");
}

export function isApplicationUrl(candidate: string, expected: string, packaged: boolean): boolean {
  try {
    const actual = new URL(candidate);
    const application = new URL(expected);
    if (actual.username || actual.password) return false;
    actual.hash = ""; application.hash = "";
    return packaged ? actual.protocol === "file:" && actual.href === application.href
      : actual.protocol === "http:" && actual.origin === application.origin;
  } catch { return false; }
}

/** All runtime handler modules receive this registrar; no handler can bypass sender checks. */
export function createSecureIpc(transport: IpcRegistrar, context: {
  getWindow: () => BrowserWindow | null;
  getAppUrl: () => string;
  isPackaged: () => boolean;
}): IpcRegistrar {
  return {
    removeHandler: (channel) => transport.removeHandler(channel),
    handle: (channel, handler) => {
      if (!isAppIpcChannel(channel)) throw new Error("Unreviewed IPC channel");
      transport.handle(channel, async (event, ...args) => {
        const owner = context.getWindow();
        const frame = event.senderFrame;
        if (!owner || event.sender.id !== owner.webContents.id || !frame ||
          frame !== owner.webContents.mainFrame || !isApplicationUrl(frame.url, context.getAppUrl(), context.isPackaged())) {
          throw new Error("Unauthorized IPC sender");
        }
        // Installed-app state is authoritative even when NODE_ENV/VITEST are inherited.
        if (context.isPackaged() && DEVELOPMENT_ONLY_CHANNELS.has(channel)) {
          throw new Error("This operation is development-only");
        }
        return handler(event, ...args);
      });
    },
  };
}

export function protectWindow(owner: BrowserWindow, appUrl: string, packaged: boolean): void {
  const contents = owner.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  const preventExternalNavigation = (event: { preventDefault(): void }, url: string) => {
    if (!isApplicationUrl(url, appUrl, packaged)) event.preventDefault();
  };
  contents.on("will-navigate", preventExternalNavigation);
  contents.on("will-redirect", preventExternalNavigation);
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
}
