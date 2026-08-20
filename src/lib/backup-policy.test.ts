import { describe, expect, it } from "vitest";
import { backupTableNames, isLocalOnlyBackupSetting } from "@/lib/backup-policy";

describe("backup payload policy", () => {
  it("never includes community commerce or authorization tables", () => {
    expect(backupTableNames).not.toContain("study_desk_community_entitlements");
    expect(backupTableNames).not.toContain("study_desk_community_products");
    expect(backupTableNames).not.toContain("study_desk_memberships");
    expect(backupTableNames).not.toContain("study_desk_membership_payments");
  });

  it("keeps account, credential, and device sync state local", () => {
    expect(isLocalOnlyBackupSetting("cloudSyncUrl")).toBe(true);
    expect(isLocalOnlyBackupSetting("supabaseSyncEmail")).toBe(true);
    expect(isLocalOnlyBackupSetting("accountSyncHistoryLimit")).toBe(true);
    expect(isLocalOnlyBackupSetting("dailyReviewTarget")).toBe(false);
  });
});
