import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) =>
      ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: any[]) => void) =>
      ipcRenderer.on(channel, (_event, ...args) => listener(...args)),
    // Optionally add more methods as needed
  },
});
