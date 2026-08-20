import "server-only";
import { after } from "next/server";

function runAutoBackup() {
  void import("@/lib/auto-backup").then(({ triggerAutoBackup }) => triggerAutoBackup());
}

/** Schedules a backup after the response has been sent, never delaying a user action. */
export function scheduleAutoBackup() {
  try { after(runAutoBackup); }
  catch { runAutoBackup(); }
}
