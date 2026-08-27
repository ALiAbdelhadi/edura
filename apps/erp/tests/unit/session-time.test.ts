// Proof for "which lesson is next", the figure the student home leads with.
//
// Two bugs are pinned here, both of which were live:
//
// 1. The schedule screen matched a weekday NAME against `new Date(s.date)
//    .getDay()`, so picking "الثلاثاء" listed every Tuesday session that had
//    ever been held, past ones included. `sessionsOnDay` matches a calendar
//    DAY instead.
// 2. `Session.date` is a calendar day pinned to UTC midnight. Reading the LOCAL
//    day back out of it is only safe east of Greenwich. `dateKeyOf` reads the
//    day the string already states.
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
  // The suite used to be titled "the calendar day, never shifted", which is
  // the claim the docblock made about both branches and is true of only one.

  describe("string in — the day the value already states, unshiftable", () => {
    it("takes the ten characters and converts nothing", () => {
      expect(dateKeyOf("2026-08-20T00:00:00.000Z")).toBe("2026-08-20");
    });

    it("does not move the day for a zone west of Greenwich", () => {
      // `new Date("2026-08-20T00:00:00.000Z").getDate()` is 19 in New York. The
      // slice cannot be wrong that way, in any zone.
      expect(dateKeyOf("2026-08-20T00:00:00.000Z")).not.toBe("2026-08-19");
    });
  });

  describe("Date in — the DEVICE's day, and it IS shifted", () => {
    it("reads local fields, which is right only for a local-midnight Date", () => {
      // Local in, local out. Written this way on purpose: it is what a date
      // picker hands back, and `pickedDateKey` in date-key.ts is the same rule.
      expect(dateKeyOf(new Date(2026, 7, 20, 13, 30))).toBe("2026-08-20");
    });

    it("gives the DEVICE's day for an instant, which is why an instant is banned", () => {
      // Pinned so the shift is on the record rather than implied. This instant
      // is 01:30 on the 20th in Cairo and 22:30 on the 19th in UTC, and the
      // branch answers with whichever zone the reader is in — never Cairo. A
      // `todayKey` built on this is the bug the sibling commit removed.
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
  // EVERY assertion here names an absolute instant, and that is the whole
  // point of the rewrite. The old version read `at.getHours()` and expected
  // 16 — a LOCAL field — after building the instant from a local parse. Local
  // in, local out: it agreed with itself in every timezone on earth and could
  // not have failed however wrong `startsAt` was. It passed under TZ=UTC on
  // the unfixed code, which is exactly how the defect survived.
  //
  // An ISO string has one meaning everywhere. These fail on a wrong zone.

  it("puts a 16:00 lesson at 13:00Z in August — Cairo is UTC+3 on DST", () => {
    expect(startsAt(s("2026-08-20T00:00:00.000Z", "16:00")).toISOString()).toBe(
      "2026-08-20T13:00:00.000Z",
    );
  });

  it("puts the same 16:00 lesson at 14:00Z in January — Cairo is UTC+2", () => {
    // Same wall-clock, different offset. A fix that hardcoded +3 passes the
    // test above and fails this one.
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
    // `platformInstant` reaches Intl.formatToParts, which raises RangeError on
    // an invalid date. One malformed row must not take down a portal screen,
    // so the guard returns a value that compares false against every bound.
    expect(Number.isNaN(startsAt(s("", "16:00")).getTime())).toBe(true);
    expect(Number.isNaN(startsAt(s("2026-08-20T00:00:00.000Z", "6pm")).getTime())).toBe(true);
    expect(() => startsAt(s("nonsense", "16:00"))).not.toThrow();
  });
});

describe("upcomingSessions — what the hero picks from", () => {
  // 12:00 Cairo, stated as the instant it is. Built from local fields
  // (`new Date(2026, 7, 20, 12, 0)`) this was noon on the RUNNER's clock, so
  // under TZ=UTC it silently became 15:00 Cairo and moved which lessons count
  // as ahead — the suite would have started disagreeing with itself once
  // `startsAt` was fixed, and the disagreement would have looked like the fix
  // breaking something.
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
    // A 12:00 Cairo lesson is 09:00Z in August. The three probes are 12:10,
    // 11:50 and 13:00 CAIRO, written as instants so the window being asserted
    // is the student's real one and not the runner's.
    const session = s("2026-08-20T00:00:00.000Z", "12:00");
    expect(isHappeningNow(session, new Date("2026-08-20T09:10:00.000Z"))).toBe(true);
    expect(isHappeningNow(session, new Date("2026-08-20T08:50:00.000Z"))).toBe(false);
    expect(isHappeningNow(session, new Date("2026-08-20T10:00:00.000Z"))).toBe(false);
  });

  it("is FALSE on a UTC device at the hour the old code called it now", () => {
    // The regression this whole commit exists to stop. `startsAt` used to
    // parse the zoneless literal in the device's zone, so on a UTC device a
    // 16:00 Cairo lesson claimed to start at 16:00Z — 19:00 Cairo, three hours
    // after it ended. At 16:10Z the student portal said "you are in the room".
    const session = s("2026-08-20T00:00:00.000Z", "16:00");
    expect(isHappeningNow(session, new Date("2026-08-20T16:10:00.000Z"))).toBe(false);
    expect(isHappeningNow(session, new Date("2026-08-20T13:10:00.000Z"))).toBe(true);
  });
});

describe("weekDayKeys — the strip is anchored on the CAIRO day", () => {
  // The instant is chosen so the two answers land in DIFFERENT WEEKS, which is
  // the only way this assertion can discriminate. 2026-08-22 21:30Z is still
  // Saturday the 22nd on a UTC device, but already 00:30 on SUNDAY the 23rd in
  // Cairo — and Sunday is where a week starts here. So:
  //
  //   Cairo day  2026-08-23 (Sun) -> the week 23–29   <- correct
  //   device day 2026-08-22 (Sat) -> the week 16–22   <- what it used to give
  //
  // A whole week apart, not a column. Pick an instant mid-week instead and both
  // answers return the same seven keys, which is how a weaker version of this
  // test would pass on the broken code.
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
  // A STRUCTURAL guard, not a style check. Two exported functions named
  // `todayKey` — one Cairo, one device-local, same signature, same return
  // shape — is what made this class of bug invisible: nothing at the import
  // site said which one you had. Re-adding one here brings the ambiguity back
  // whatever its body does, so the name itself is what is asserted absent.
  it("does not re-introduce the name that shadowed the Cairo one", () => {
    expect(Object.keys(sessionTime)).not.toContain("todayKey");
  });
});
