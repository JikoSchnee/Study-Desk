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
  network: {
    diagnostics: () => ipcRenderer.invoke("network:diagnostics"),
  },
  server: {
    onStatus: (listener) => {
      const failed = (_event, message) => listener({ state: "error", message });
      const recovered = () => listener({ state: "ready" });
      ipcRenderer.on("desktop:server-error", failed);
      ipcRenderer.on("desktop:server-recovered", recovered);
      return () => { ipcRenderer.removeListener("desktop:server-error", failed); ipcRenderer.removeListener("desktop:server-recovered", recovered); };
    },
  },
});
