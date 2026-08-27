import { describe, expect, it } from "vitest";
import {
  PLATFORM_TIME_ZONE,
  endOfPlatformDay,
  platformDayKey,
  shiftDayKey,
  startOfPlatformDay,
  todayKey,
} from "@repo/server-core/lib/date-key";
import { dayRange, platformTodayWindow } from "@repo/server-core/lib/day-range";

function cairoClock(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

describe("a platform day is bounded on the Cairo clock", () => {
  it("an ordinary day starts at 00:00 Cairo and ends at 23:59:59 Cairo", () => {
    expect(cairoClock(startOfPlatformDay("2026-08-20"))).toBe("2026-08-20, 00:00:00");
    expect(cairoClock(endOfPlatformDay("2026-08-20"))).toBe("2026-08-20, 23:59:59");
  });

  it("in UTC that day begins on the PREVIOUS date — the whole finding", () => {
    expect(startOfPlatformDay("2026-08-20").toISOString()).toBe("2026-08-19T21:00:00.000Z");
  });

  it("every instant of the day resolves back to the same day key", () => {
    for (const key of ["2026-01-15", "2026-04-24", "2026-08-20", "2026-10-29", "2026-12-31"]) {
      expect(todayKey(startOfPlatformDay(key))).toBe(key);
      expect(todayKey(endOfPlatformDay(key))).toBe(key);
    }
  });

  it("the bounds are TIGHT — 1ms outside either end is a different day", () => {
    for (const key of ["2026-01-15", "2026-04-24", "2026-08-20", "2026-10-29"]) {
      const before = new Date(startOfPlatformDay(key).getTime() - 1);
      const after = new Date(endOfPlatformDay(key).getTime() + 1);
      expect(todayKey(before)).toBe(shiftDayKey(key, -1));
      expect(todayKey(after)).toBe(shiftDayKey(key, 1));
    }
  });

  it("consecutive days abut with no unowned millisecond between them", () => {
    for (const key of ["2026-04-23", "2026-08-20", "2026-10-29"]) {
      const gap = startOfPlatformDay(shiftDayKey(key, 1)).getTime() - endOfPlatformDay(key).getTime();
      expect(gap).toBe(1);
    }
  });
});

describe("the two DST transitions, which is where an assumed offset breaks", () => {
  it("DST START: midnight does not exist, so the day starts at 01:00", () => {
    expect(cairoClock(startOfPlatformDay("2026-04-24"))).toBe("2026-04-24, 01:00:00");
    expect(todayKey(startOfPlatformDay("2026-04-24"))).toBe("2026-04-24");
    expect(todayKey(new Date(startOfPlatformDay("2026-04-24").getTime() - 1))).toBe("2026-04-23");
  });

  it("DST START: that day is 23 hours long", () => {
    const span = endOfPlatformDay("2026-04-24").getTime() - startOfPlatformDay("2026-04-24").getTime();
    expect(span + 1).toBe(23 * 60 * 60 * 1000);
  });

  it("DST END: 23:00-23:59 happens twice and the day ends at the SECOND one", () => {
    const end = endOfPlatformDay("2026-10-29");
    expect(cairoClock(end)).toBe("2026-10-29, 23:59:59");
    expect(end.toISOString()).toBe("2026-10-29T21:59:59.999Z");
    expect(new Date("2026-10-29T20:30:00.000Z") <= end).toBe(true);
    expect(new Date("2026-10-29T21:30:00.000Z") <= end).toBe(true);
  });

  it("DST END: that day is 25 hours long", () => {
    const span = endOfPlatformDay("2026-10-29").getTime() - startOfPlatformDay("2026-10-29").getTime();
    expect(span + 1).toBe(25 * 60 * 60 * 1000);
  });
});

describe("platformDayKey — whatever shape the filter value arrives in", () => {
  it("a picked YYYY-MM-DD is taken at its word", () => {
    expect(platformDayKey("2026-08-20")).toBe("2026-08-20");
  });

  it("an instant resolves to the Cairo day it falls in", () => {
    expect(platformDayKey("2026-08-19T23:30:00.000Z")).toBe("2026-08-20");
  });

  it("a picker's local-midnight ISO string resolves to the day that was clicked", () => {
    expect(platformDayKey("2026-08-20T00:00:00.000+03:00")).toBe("2026-08-20");
  });
});

describe("dayRange — one derivation for every money filter", () => {
  it("a single day covers that Cairo day exactly", () => {
    expect(dayRange("2026-08-20", "2026-08-20")).toEqual({
      gte: new Date("2026-08-19T21:00:00.000Z"),
      lte: new Date("2026-08-20T20:59:59.999Z"),
    });
  });

  it("THE SCENARIO: cash taken at 01:00 Cairo is on that Cairo day", () => {
    const takenAt = new Date("2026-08-19T22:00:00.000Z");
    expect(cairoClock(takenAt)).toBe("2026-08-20, 01:00:00");

    const today = dayRange("2026-08-20", "2026-08-20")!;
    expect(takenAt >= today.gte!).toBe(true);
    expect(takenAt <= today.lte!).toBe(true);

    const yesterday = dayRange("2026-08-19", "2026-08-19")!;
    expect(takenAt <= yesterday.lte!).toBe(false);
  });

  it("the counter and the books now agree on which day a payment is on", () => {
    for (const iso of [
      "2026-08-19T22:00:00.000Z", // 01:00 Cairo — the hazardous window
      "2026-08-20T20:59:59.999Z", // 23:59:59 Cairo — the last instant
      "2026-08-20T09:00:00.000Z", // the middle of a working day
      "2026-10-29T21:30:00.000Z", // inside the repeated DST hour
      "2026-04-23T22:00:00.000Z", // the spring-forward instant itself
    ]) {
      const at = new Date(iso);
      const counterDay = todayKey(at);
      const books = dayRange(counterDay, counterDay)!;
      expect(at >= books.gte! && at <= books.lte!).toBe(true);
    }
  });

  it("open ends stay open, and no filter means no clause", () => {
    expect(dayRange("2026-08-01")).toEqual({ gte: new Date("2026-07-31T21:00:00.000Z") });
    expect(dayRange(undefined, "2026-08-31")).toEqual({ lte: new Date("2026-08-31T20:59:59.999Z") });
    expect(dayRange()).toBeUndefined();
  });

  it("date-ONLY columns still select correctly under a Cairo window", () => {
    const r = dayRange("2026-08-20", "2026-08-20")!;
    const anchor = (k: string) => new Date(`${k}T00:00:00.000Z`);
    expect(anchor("2026-08-20") >= r.gte! && anchor("2026-08-20") <= r.lte!).toBe(true);
    expect(anchor("2026-08-19") >= r.gte!).toBe(false);
    expect(anchor("2026-08-21") <= r.lte!).toBe(false);
  });
});

describe("platformTodayWindow — the dashboards' 'today'", () => {
  it("is half-open and exactly one Cairo day wide", () => {
    const w = platformTodayWindow(new Date("2026-08-20T09:00:00.000Z"));
    expect(w.gte.toISOString()).toBe("2026-08-19T21:00:00.000Z");
    expect(w.lt.toISOString()).toBe("2026-08-20T21:00:00.000Z");
  });

  it("THE BUG: at 00:30 Cairo it is TODAY, not yesterday", () => {
    const afterMidnight = new Date("2026-08-19T21:30:00.000Z");
    expect(cairoClock(afterMidnight)).toBe("2026-08-20, 00:30:00");

    const w = platformTodayWindow(afterMidnight);
    expect(todayKey(w.gte)).toBe("2026-08-20");
    const session20 = new Date("2026-08-20T00:00:00.000Z");
    expect(session20 >= w.gte && session20 < w.lt).toBe(true);
    const session19 = new Date("2026-08-19T00:00:00.000Z");
    expect(session19 >= w.gte).toBe(false);
  });

  it("today's window ends exactly where tomorrow's begins", () => {
    const now = new Date("2026-04-23T23:00:00.000Z"); // DST-start day in Cairo
    const today = platformTodayWindow(now);
    const tomorrow = platformTodayWindow(new Date(today.lt.getTime()));
    expect(tomorrow.gte.getTime()).toBe(today.lt.getTime());
  });
});
