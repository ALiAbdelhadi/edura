// Proof for the two kinds of YYYY-MM-DD key.
//
// `new Date().toISOString().slice(0, 10)` was written 26 times across both apps
// and server-core, doing two different jobs with one expression. It is right for
// one of them and wrong for the other, and because both produce the same SHAPE
// the difference never surfaced as an error — only as an off-by-one day for the
// couple of hours after local midnight.
//
// Egypt is UTC+2, and UTC+3 while DST is in force. So between 00:00 and
// 02:00/03:00 Cairo, the UTC calendar day is still YESTERDAY. Anything that
// asked "what day is it" through UTC was wrong for those hours: the door
// check-in screen fetched the previous day's sessions, the audit screens'
// Today/Yesterday labels were off, and `isNotPastDate` accepted a start date
// that had already passed locally.
import { describe, expect, it } from "vitest";
import {
  PLATFORM_TIME_ZONE,
  parseDateKey,
  pickedDateKey,
  toDateKey,
  todayKey,
} from "@repo/server-core/lib/date-key";

describe("toDateKey — formats a value that is already a day", () => {
  it("reads the UTC calendar day off a date-only column", () => {
    // What Postgres hands back for `@db.Date`: midnight UTC.
    expect(toDateKey(new Date("2026-08-02T00:00:00.000Z"))).toBe("2026-08-02");
  });

  it("accepts a string as well as a Date", () => {
    expect(toDateKey("2026-08-02T00:00:00.000Z")).toBe("2026-08-02");
  });
});

describe("todayKey — answers what day it is in Cairo", () => {
  it("is Africa/Cairo, not the host's zone", () => {
    expect(PLATFORM_TIME_ZONE).toBe("Africa/Cairo");
  });

  it("THE BUG: 00:30 Cairo is still the previous day in UTC", () => {
    // 2026-08-02T22:30Z is 2026-08-03 00:30 in Cairo (UTC+2).
    const justAfterLocalMidnight = new Date("2026-08-02T22:30:00.000Z");

    // What the old expression produced — the day before the user's day.
    expect(justAfterLocalMidnight.toISOString().slice(0, 10)).toBe("2026-08-02");
    // What the user's wall-clock actually says.
    expect(todayKey(justAfterLocalMidnight)).toBe("2026-08-03");
  });

  it("agrees with UTC during the rest of the day", () => {
    const midMorning = new Date("2026-08-02T09:00:00.000Z");
    expect(todayKey(midMorning)).toBe("2026-08-02");
    expect(midMorning.toISOString().slice(0, 10)).toBe("2026-08-02");
  });

  it("shifts a whole day back when asked for yesterday", () => {
    const now = new Date("2026-08-02T09:00:00.000Z");
    expect(todayKey(new Date(now.getTime() - 86_400_000))).toBe("2026-08-01");
  });

  it("returns a well-formed key", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("pickedDateKey / parseDateKey — what a calendar hands back", () => {
  it("THE BUG: a picked date is LOCAL midnight, so the UTC day can be the day before", () => {
    // What a date picker produces when the user clicks 2 August.
    const picked = new Date(2026, 7, 2);

    expect(pickedDateKey(picked)).toBe("2026-08-02");
    // toDateKey reads the UTC calendar day. East of UTC that is 1 August — the
    // filter would query the day before the one the user clicked.
    if (picked.getTimezoneOffset() < 0) {
      expect(toDateKey(picked)).toBe("2026-08-01");
    }
  });

  it("round-trips a key through the calendar and back", () => {
    for (const key of ["2026-01-01", "2026-08-02", "2026-12-31"]) {
      expect(pickedDateKey(parseDateKey(key)!)).toBe(key);
    }
  });

  it("parses to local midnight, never UTC midnight", () => {
    const d = parseDateKey("2026-08-02")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });

  it("rejects anything that is not a key", () => {
    for (const bad of ["", "2026-8-2", "02-08-2026", "2026-08-02T00:00:00Z"]) {
      expect(parseDateKey(bad)).toBeUndefined();
    }
  });
});
