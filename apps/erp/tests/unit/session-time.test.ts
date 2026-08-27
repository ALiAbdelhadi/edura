import { describe, expect, it } from "vitest";
import {
  dateKeyOf,
  isHappeningNow,
  sessionsOnDay,
  startsAt,
  upcomingSessions,
  weekDayKeys,
} from "@/features/sessions/session-time";
import * as sessionTime from "@/features/sessions/session-time";

const s = (date: string, startTime: string, status = "scheduled") => ({
  date,
  startTime,
  status,
});

describe("dateKeyOf — TWO branches, and they answer different questions", () => {

  describe("string in — the day the value already states, unshiftable", () => {
    it("takes the ten characters and converts nothing", () => {
      expect(dateKeyOf("2026-08-20T00:00:00.000Z")).toBe("2026-08-20");
    });

    it("does not move the day for a zone west of Greenwich", () => {
      expect(dateKeyOf("2026-08-20T00:00:00.000Z")).not.toBe("2026-08-19");
    });
  });

  describe("Date in — the DEVICE's day, and it IS shifted", () => {
    it("reads local fields, which is right only for a local-midnight Date", () => {
      expect(dateKeyOf(new Date(2026, 7, 20, 13, 30))).toBe("2026-08-20");
    });

    it("gives the DEVICE's day for an instant, which is why an instant is banned", () => {
      const acrossCairoMidnight = new Date("2026-08-19T22:30:00.000Z");
      const local = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(acrossCairoMidnight);
      expect(dateKeyOf(acrossCairoMidnight)).toBe(local);
    });
  });

  it("answers empty for a missing value rather than throwing", () => {
    expect(dateKeyOf(null)).toBe("");
  });
});

describe("startsAt — the wall-clock instant, on the CAIRO clock", () => {

  it("puts a 16:00 lesson at 13:00Z in August — Cairo is UTC+3 on DST", () => {
    expect(startsAt(s("2026-08-20T00:00:00.000Z", "16:00")).toISOString()).toBe(
      "2026-08-20T13:00:00.000Z",
    );
  });

  it("puts the same 16:00 lesson at 14:00Z in January — Cairo is UTC+2", () => {
    expect(startsAt(s("2026-01-20T00:00:00.000Z", "16:00")).toISOString()).toBe(
      "2026-01-20T14:00:00.000Z",
    );
  });

  it("defaults a missing clock time to Cairo midnight", () => {
    expect(startsAt(s("2026-08-20T00:00:00.000Z", "")).toISOString()).toBe(
      "2026-08-19T21:00:00.000Z",
    );
  });

  it("gives an Invalid Date for an unusable row rather than throwing", () => {
    expect(Number.isNaN(startsAt(s("", "16:00")).getTime())).toBe(true);
    expect(Number.isNaN(startsAt(s("2026-08-20T00:00:00.000Z", "6pm")).getTime())).toBe(true);
    expect(() => startsAt(s("nonsense", "16:00"))).not.toThrow();
  });
});

describe("upcomingSessions — what the hero picks from", () => {
  const now = new Date("2026-08-20T09:00:00.000Z");

  it("orders by the instant a lesson begins, not by the row order", () => {
    const list = [
      s("2026-08-24T00:00:00.000Z", "16:00"),
      s("2026-08-20T00:00:00.000Z", "18:00"),
      s("2026-08-20T00:00:00.000Z", "14:00"),
    ];
    expect(upcomingSessions(list, now).map((x) => `${dateKeyOf(x.date)} ${x.startTime}`)).toEqual([
      "2026-08-20 14:00",
      "2026-08-20 18:00",
      "2026-08-24 16:00",
    ]);
  });

  it("drops lessons that are over", () => {
    const list = [s("2026-08-20T00:00:00.000Z", "08:00"), s("2026-08-20T00:00:00.000Z", "14:00")];
    expect(upcomingSessions(list, now)).toHaveLength(1);
  });

  it("KEEPS a lesson that started minutes ago — the student is in the room", () => {
    const list = [s("2026-08-20T00:00:00.000Z", "11:30")];
    expect(upcomingSessions(list, now)).toHaveLength(1);
  });

  it("never offers a cancelled lesson as what is next", () => {
    const list = [
      s("2026-08-20T00:00:00.000Z", "14:00", "cancelled"),
      s("2026-08-20T00:00:00.000Z", "18:00"),
    ];
    expect(upcomingSessions(list, now).map((x) => x.startTime)).toEqual(["18:00"]);
  });

  it("counts a postponed lesson as still ahead", () => {
    const list = [s("2026-08-20T00:00:00.000Z", "14:00", "postponed")];
    expect(upcomingSessions(list, now)).toHaveLength(1);
  });
});

describe("sessionsOnDay — one calendar day, not every same-weekday session ever", () => {
  it("matches the day and ignores the weekday", () => {
    const list = [
      s("2026-08-11T00:00:00.000Z", "16:00"), // a Tuesday, two weeks earlier
      s("2026-08-25T00:00:00.000Z", "16:00"), // the Tuesday being asked about
    ];
    expect(sessionsOnDay(list, "2026-08-25")).toHaveLength(1);
  });
});

describe("isHappeningNow", () => {
  it("is true from the start time until the grace window closes", () => {
    const session = s("2026-08-20T00:00:00.000Z", "12:00");
    expect(isHappeningNow(session, new Date("2026-08-20T09:10:00.000Z"))).toBe(true);
    expect(isHappeningNow(session, new Date("2026-08-20T08:50:00.000Z"))).toBe(false);
    expect(isHappeningNow(session, new Date("2026-08-20T10:00:00.000Z"))).toBe(false);
  });

  it("is FALSE on a UTC device at the hour the old code called it now", () => {
    const session = s("2026-08-20T00:00:00.000Z", "16:00");
    expect(isHappeningNow(session, new Date("2026-08-20T16:10:00.000Z"))).toBe(false);
    expect(isHappeningNow(session, new Date("2026-08-20T13:10:00.000Z"))).toBe(true);
  });
});

describe("weekDayKeys — the strip is anchored on the CAIRO day", () => {
  const CAIRO_SUNDAY = new Date("2026-08-22T21:30:00.000Z");

  it("returns the week holding the CAIRO day, a week away from the device's", () => {
    expect(weekDayKeys(CAIRO_SUNDAY)).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  it("starts on Sunday, matching the attendance heatmap", () => {
    expect(weekDayKeys(new Date("2026-08-19T22:30:00.000Z"))[0]).toBe("2026-08-16");
  });

  it("moves whole weeks and crosses a month end cleanly", () => {
    expect(weekDayKeys(CAIRO_SUNDAY, -1)[0]).toBe("2026-08-16");
    expect(weekDayKeys(CAIRO_SUNDAY, 1)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });
});

describe("the module exports no `todayKey`", () => {
  it("does not re-introduce the name that shadowed the Cairo one", () => {
    expect(Object.keys(sessionTime)).not.toContain("todayKey");
  });
});
