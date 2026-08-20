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
} from "@/features/student/session-time";

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

describe("startsAt — the wall-clock instant, in the reader's zone", () => {
  it("applies the lesson's clock time to the stated day", () => {
    const at = startsAt(s("2026-08-20T00:00:00.000Z", "16:00"));
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(7);
    expect(at.getDate()).toBe(20);
    expect(at.getHours()).toBe(16);
  });
});

describe("upcomingSessions — what the hero picks from", () => {
  const now = new Date(2026, 7, 20, 12, 0);

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
    expect(isHappeningNow(session, new Date(2026, 7, 20, 12, 10))).toBe(true);
    expect(isHappeningNow(session, new Date(2026, 7, 20, 11, 50))).toBe(false);
    expect(isHappeningNow(session, new Date(2026, 7, 20, 13, 0))).toBe(false);
  });
});
