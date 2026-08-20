import { describe, expect, it } from "vitest";
import { followingSyncAt, scheduledSyncAt, syncDelay } from "@/lib/sync-schedule";

const now = new Date("2026-08-11T04:00:00.000Z");

describe("persistent sync schedule", () => {
  it("uses a valid saved deadline without resetting it on restart", () => {
    expect(scheduledSyncAt({ savedAt: "2026-08-11T04:15:00.000Z", lastSyncedAt: "2026-08-11T03:00:00.000Z", intervalMinutes: 60, now })).toBe("2026-08-11T04:15:00.000Z");
    expect(syncDelay("2026-08-11T04:15:00.000Z", now)).toBe(15 * 60_000);
  });

  it("derives a first or changed schedule from the last successful sync", () => {
    expect(scheduledSyncAt({ lastSyncedAt: "2026-08-11T03:30:00.000Z", intervalMinutes: 60, now })).toBe("2026-08-11T04:30:00.000Z");
    expect(scheduledSyncAt({ intervalMinutes: 60, now })).toBe(now.toISOString());
  });

  it("starts immediately when the stored deadline has elapsed and schedules the following run", () => {
    expect(syncDelay("2026-08-11T03:59:00.000Z", now)).toBe(0);
    expect(followingSyncAt(15, now)).toBe("2026-08-11T04:15:00.000Z");
  });
});
