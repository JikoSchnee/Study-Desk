const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mockInterviewDesktop", {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizeChange: (listener) => {
      const callback = (_event, maximized) => listener(maximized);
      ipcRenderer.on("window:maximize-change", callback);
      return () => ipcRenderer.removeListener("window:maximize-change", callback);
    },
  },
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    defer: () => ipcRenderer.invoke("updater:defer"),
    ignore: () => ipcRenderer.invoke("updater:ignore"),
    install: () => ipcRenderer.invoke("updater:install"),
    onStatus: (listener) => {
      const callback = (_event, status) => listener(status);
      ipcRenderer.on("updater:status", callback);
      return () => ipcRenderer.removeListener("updater:status", callback);
    },
  },
});
