import { describe, expect, it } from "vitest";
import { resolveSettingsSection } from "./settings-sections";

describe("settings section resolution", () => {
  it("defaults to learning preferences when no section is provided", () => {
    expect(resolveSettingsSection(null)).toBe("learning");
    expect(resolveSettingsSection(undefined)).toBe("learning");
  });

  it("accepts every public settings section", () => {
    expect(resolveSettingsSection("backup-sync")).toBe("backup-sync");
    expect(resolveSettingsSection("guide")).toBe("guide");
  });

  it("falls back safely for invalid deep links", () => {
    expect(resolveSettingsSection("unknown")).toBe("learning");
  });
});
