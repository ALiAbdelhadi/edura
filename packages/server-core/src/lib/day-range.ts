import {
  endOfPlatformDay,
  platformDayKey,
  startOfPlatformDay,
  todayKey,
} from "./date-key";

export type DayRange = { gte?: Date; lte?: Date };

export function dayRange(from?: string, to?: string): DayRange | undefined {
  if (!from && !to) return undefined;
  const range: DayRange = {};
  if (from) range.gte = startOfPlatformDay(platformDayKey(from));
  if (to) range.lte = endOfPlatformDay(platformDayKey(to));
  return range;
}

export function platformTodayWindow(now: Date = new Date()): { gte: Date; lt: Date } {
  const today = todayKey(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { gte: startOfPlatformDay(today), lt: startOfPlatformDay(tomorrow) };
}
