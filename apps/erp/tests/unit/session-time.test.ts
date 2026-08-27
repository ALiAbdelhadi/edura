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
} from "@/features/sessions/session-time";

const s = (date: string, startTime: string, status = "scheduled") => ({
  date,
  startTime,
  status,
});

describe("dateKeyOf — the calendar day, never shifted", () => {
  it("takes the day an ISO instant already states", () => {
    expect(dateKeyOf("2026-08-20T00:00:00.000Z")).toBe("2026-08-20");
  });

  it("does not move the day for a zone west of Greenwich", () => {
    // `new Date("2026-08-20T00:00:00.000Z").getDate()` is 19 in New York. The
    // slice cannot be wrong that way, in any zone.
    expect(dateKeyOf("2026-08-20T00:00:00.000Z")).not.toBe("2026-08-19");
  });

  it("reads a real Date in the reader's own zone", () => {
    expect(dateKeyOf(new Date(2026, 7, 20, 13, 30))).toBe("2026-08-20");
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
