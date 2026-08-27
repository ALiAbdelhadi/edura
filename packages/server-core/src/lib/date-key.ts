export const PLATFORM_TIME_ZONE = "Africa/Cairo";

const KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLATFORM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toDateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

export function todayKey(now: Date = new Date()): string {
  return KEY_FORMAT.format(now);
}

export function pickedDateKey(picked: Date): string {
  const y = picked.getFullYear();
  const m = String(picked.getMonth() + 1).padStart(2, "0");
  const d = String(picked.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLATFORM_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function platformOffsetMs(instant: Date): number {
  const parts: Record<string, string> = {};
  for (const p of PARTS_FORMAT.formatToParts(instant)) parts[p.type] = p.value;
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

export function platformInstant(
  key: string,
  h: number,
  m: number,
  s: number,
  ms: number,
): Date {
  const y = Number(key.slice(0, 4));
  const mo = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const wall = Date.UTC(y, mo - 1, d, h, m, s, ms);
  const guess = wall - platformOffsetMs(new Date(wall));
  return new Date(wall - platformOffsetMs(new Date(guess)));
}

export function startOfPlatformDay(key: string): Date {
  return platformInstant(key, 0, 0, 0, 0);
}

export function endOfPlatformDay(key: string): Date {
  return platformInstant(key, 23, 59, 59, 999);
}

export function platformDayKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayKey(new Date(value));
}

export function shiftDayKey(key: string, days: number): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}
