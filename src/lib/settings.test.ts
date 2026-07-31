import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rows: [] as Array<{ key: string; value: string }>, run: vi.fn() }));

vi.mock("./db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      all: () => database.rows,
      run: database.run,
    })),
  },
}));

import { getAppSettings, saveAppSettings, saveEmbeddingModelSource } from "./settings";

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
});
