const DAY_IN_MILLISECONDS = 86_400_000;
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000;

function chinaCalendarDay(timestamp: string | number): number | undefined {
  const value = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(value)) return undefined;

  const chinaDate = new Date(value + CHINA_TIME_OFFSET);
  return Date.UTC(
    chinaDate.getUTCFullYear(),
    chinaDate.getUTCMonth(),
    chinaDate.getUTCDate()
  );
}

export function companionshipDayCount(registeredAt: string, now = Date.now()): number {
  const registeredDay = chinaCalendarDay(registeredAt);
  const currentDay = chinaCalendarDay(now);
  if (registeredDay === undefined || currentDay === undefined) return 1;
  return Math.max(1, Math.floor((currentDay - registeredDay) / DAY_IN_MILLISECONDS) + 1);
}

export function companionshipLabel(registeredAt: string, now = Date.now()): string {
  return `已陪伴 ${companionshipDayCount(registeredAt, now)} 天`;
}
