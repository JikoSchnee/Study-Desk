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
  updates: {
    check: () => ipcRenderer.invoke("updates:check"),
  },
});
