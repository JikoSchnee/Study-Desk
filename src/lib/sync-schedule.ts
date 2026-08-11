export function scheduledSyncAt({ savedAt, lastSyncedAt, intervalMinutes, now = new Date() }: { savedAt?: string | null; lastSyncedAt?: string | null; intervalMinutes: number; now?: Date }) {
  const saved = savedAt ? Date.parse(savedAt) : Number.NaN;
  if (Number.isFinite(saved)) return new Date(saved).toISOString();
  const last = lastSyncedAt ? Date.parse(lastSyncedAt) : Number.NaN;
  return new Date(Number.isFinite(last) ? last + intervalMinutes * 60_000 : now.getTime()).toISOString();
}

export function followingSyncAt(intervalMinutes: number, now = new Date()) { return new Date(now.getTime() + intervalMinutes * 60_000).toISOString(); }
export function syncDelay(nextSyncAt: string, now = new Date()) { return Math.max(0, Date.parse(nextSyncAt) - now.getTime()); }
