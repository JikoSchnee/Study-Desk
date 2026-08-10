import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rows: [] as Array<{ key: string; value: string }>, run: vi.fn() }));

vi.mock("./db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      all: () => database.rows,
      get: () => undefined,
      run: database.run,
    })),
  },
}));

import { getAppSettings, saveAppSettings, saveEmbeddingModelSource } from "./settings";
import { getCloudSyncConfig, saveCloudSyncConfig } from "./cloud-sync";

describe("embedding model source setting", () => {
  it("defaults existing installations to automatic downloads", () => {
    database.rows = [];
    expect(getAppSettings().embeddingModelSource).toBe("automatic");
  });

  it("reads and persists the offline import preference", () => {
    database.rows = [{ key: "embeddingModelSource", value: "offline" }];
    expect(getAppSettings().embeddingModelSource).toBe("offline");
    expect(saveEmbeddingModelSource("offline")).toBe("offline");
    expect(database.run).toHaveBeenCalledWith("embeddingModelSource", "offline");
  });

  it("persists a user-selected knowledge base path", () => {
    const settings = { ...getAppSettings(), knowledgeBasePath: "C:\\Users\\Learner\\Notes\\README.md" };
    expect(saveAppSettings(settings).knowledgeBasePath).toBe(settings.knowledgeBasePath);
    expect(database.run).toHaveBeenCalledWith("knowledgeBasePath", settings.knowledgeBasePath);
  });

  it("enables daily automatic backups by default for existing installations", () => {
    database.rows = [];
    expect(getAppSettings()).toMatchObject({ autoBackupEnabled: true, autoBackupMode: "daily", autoBackupMaxStorageMb: 100, autoBackupOverflowPolicy: "delete-oldest" });
  });

  it("keeps daily reports for 30 days by default and supports permanent retention", () => {
    database.rows = [];
    expect(getAppSettings().dailyReportRetentionDays).toBe(30);
    database.rows = [{ key: "dailyReportRetentionDays", value: "permanent" }];
    expect(getAppSettings().dailyReportRetentionDays).toBeNull();
    saveAppSettings({ ...getAppSettings(), dailyReportRetentionDays: null });
    expect(database.run).toHaveBeenCalledWith("dailyReportRetentionDays", "permanent");
  });

  it("keeps WebDAV sync configuration local with safe automatic defaults", () => {
    expect(getCloudSyncConfig()).toMatchObject({ enabled: true, mode: "automatic", intervalMinutes: 60, directory: "study-desk", maxStorageMb: 100 });
    saveCloudSyncConfig({ ...getCloudSyncConfig(), url: "https://dav.example.com/", directory: "/study-desk/", username: "learner" });
    expect(database.run).toHaveBeenCalledWith("cloudSyncUrl", "https://dav.example.com");
    expect(database.run).toHaveBeenCalledWith("cloudSyncDirectory", "study-desk");
  });
});
