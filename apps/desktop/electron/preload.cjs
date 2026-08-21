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
    status: () => ipcRenderer.invoke("updates:status"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install"),
    onStatus: (listener) => {
      const callback = (_event, status) => listener(status);
      ipcRenderer.on("updates:status", callback);
      return () => ipcRenderer.removeListener("updates:status", callback);
    },
  },
  network: {
    diagnostics: () => ipcRenderer.invoke("network:diagnostics"),
  },
  backup: {
    exportEncrypted: () => ipcRenderer.invoke("backup:export"),
    chooseImport: () => ipcRenderer.invoke("backup:choose-import"),
    restore: (mode) => ipcRenderer.invoke("backup:restore", mode),
    showRecoveryPoints: () => ipcRenderer.invoke("backup:show-recovery-points"),
  },
  supabaseSync: {
    sessionStatus: () => ipcRenderer.invoke("supabase-sync:session-status"),
    saveSession: (value) => ipcRenderer.invoke("supabase-sync:save-session", value),
    openOAuth: (url) => ipcRenderer.invoke("supabase-sync:open-oauth", url),
    onMagicLink: (listener) => { const handler = (_event, result) => listener(result); ipcRenderer.on("supabase-sync:magic-link", handler); return () => ipcRenderer.removeListener("supabase-sync:magic-link", handler); },
    onSessionChange: (listener) => { const handler = (_event, result) => listener(result); ipcRenderer.on("supabase-sync:session-change", handler); return () => ipcRenderer.removeListener("supabase-sync:session-change", handler); },
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
