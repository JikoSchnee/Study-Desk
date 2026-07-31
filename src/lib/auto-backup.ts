import "server-only";
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBackup } from "@/lib/backup";
import { sqlite } from "@/lib/db";
import { getAppSettings } from "@/lib/settings";

const backupDirectory = join(process.env.MOCK_INTERVIEW_HOME || process.cwd(), "data", "backups");
const bytesPerMb = 1024 * 1024;
type BackupFile = { name: string; path: string; size: number; modifiedAt: number };
export type AutoBackupStatus = { directory: string; totalBytes: number; count: number; lastBackupAt: string | null; pausedReason: string | null; minimumStorageMb: number };

function setting(key: string) { return (sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value; }
function saveSetting(key: string, value: string) { sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value); }
function listFiles(): BackupFile[] {
  try {
    if (!process.env.MOCK_INTERVIEW_HOME) return [];
    mkdirSync(backupDirectory, { recursive: true });
    return readdirSync(backupDirectory).filter((name) => name.startsWith("auto-backup-") && name.endsWith(".json")).map((name) => {
      const path = join(backupDirectory, name); const stat = statSync(path); return { name, path, size: stat.size, modifiedAt: stat.mtimeMs };
    }).sort((left, right) => left.modifiedAt - right.modifiedAt);
  } catch { return []; }
}
function totalBytes(files = listFiles()) { return files.reduce((total, file) => total + file.size, 0); }
function localDay(now: Date) { return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`; }
function localWeek(now: Date) { const date = new Date(now); const day = (date.getDay() + 6) % 7; date.setDate(date.getDate() - day); return localDay(date); }

export function getAutoBackupMinimumStorageMb() { return Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(createBackup())) * 2 / bytesPerMb)); }
export function validateAutoBackupStorageMb(value: number) {
  const minimum = getAutoBackupMinimumStorageMb();
  if (value < minimum) throw new Error(`自动备份空间至少需要 ${minimum} MB，才能保留两份当前备份。`);
  return minimum;
}
export function getAutoBackupStatus(): AutoBackupStatus {
  const files = listFiles();
  return { directory: backupDirectory, totalBytes: totalBytes(files), count: files.length, lastBackupAt: setting("autoBackupLastBackupAt") ?? null, pausedReason: setting("autoBackupPausedReason") ?? null, minimumStorageMb: getAutoBackupMinimumStorageMb() };
}

export function triggerAutoBackup(now = new Date()) {
  // The desktop main process supplies MOCK_INTERVIEW_HOME. Browser deployments
  // must not silently start writing server-side backup files.
  if (!process.env.MOCK_INTERVIEW_HOME) return { state: "unavailable" as const };
  const config = getAppSettings();
  if (!config.autoBackupEnabled) return { state: "disabled" as const };
  if (setting("autoBackupPausedReason")) return { state: "paused" as const };
  const periodKey = config.autoBackupMode === "daily" ? localDay(now) : config.autoBackupMode === "weekly" ? localWeek(now) : null;
  if (periodKey && setting(`autoBackupLast${config.autoBackupMode === "daily" ? "Day" : "Week"}`) === periodKey) return { state: "skipped" as const };
  try {
    const payload = JSON.stringify(createBackup());
    const newBackupBytes = Buffer.byteLength(payload);
    const limit = config.autoBackupMaxStorageMb * bytesPerMb;
    let files = listFiles();
    if (totalBytes(files) + newBackupBytes > limit) {
      if (config.autoBackupOverflowPolicy === "pause") {
        const reason = "自动备份已暂停：存储空间已达到上限。请清理历史备份、增加空间或改为删除最旧备份。";
        saveSetting("autoBackupPausedReason", reason);
        return { state: "paused" as const };
      }
      while (files.length && totalBytes(files) + newBackupBytes > limit) { unlinkSync(files[0].path); files = files.slice(1); }
    }
    if (newBackupBytes > limit) throw new Error("当前备份体积超过设置的自动备份空间上限。");
    mkdirSync(backupDirectory, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(backupDirectory, `auto-backup-${stamp}.json`), payload, "utf8");
    const completedAt = now.toISOString();
    saveSetting("autoBackupLastBackupAt", completedAt);
    if (periodKey) saveSetting(`autoBackupLast${config.autoBackupMode === "daily" ? "Day" : "Week"}`, periodKey);
    return { state: "created" as const, completedAt };
  } catch (error) {
    const reason = `自动备份失败：${error instanceof Error ? error.message : "无法写入备份文件。"}`;
    saveSetting("autoBackupPausedReason", reason);
    return { state: "error" as const, reason };
  }
}

export function resumeAutoBackup() { saveSetting("autoBackupPausedReason", ""); }
