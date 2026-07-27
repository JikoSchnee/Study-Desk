export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function todayShanghai() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHANGHAI_TIME_ZONE }).format(new Date());
}

export function shanghaiDayBounds(date = todayShanghai()) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -8));
  const end = new Date(Date.UTC(year, month - 1, day + 1, -8));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: SHANGHAI_TIME_ZONE }).format(new Date(`${date}T12:00:00Z`));
}

export function parseTags(value: string) {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

export function toTags(value: string[]) { return JSON.stringify(value); }
