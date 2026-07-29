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
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeTags(parsed.filter((tag): tag is string => typeof tag === "string")) : [];
  } catch { return []; }
}

export function normalizeTags(value: string[]) {
  const known = new Set<string>();
  return value.reduce<string[]>((tags, item) => {
    const tag = item.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || known.has(key)) return tags;
    known.add(key);
    tags.push(tag);
    return tags;
  }, []);
}

export function toTags(value: string[]) { return JSON.stringify(normalizeTags(value)); }
