import { describe, expect, it } from "vitest";
import {
  clashingSessionIds,
  findScheduleClashes,
  timesOverlap,
  type SchedulableSession,
} from "@repo/server-core/services/sessions/conflict-detector";

/**
 * The calendar's clash rule.
 *
 * It must agree with the WRITE gate (`checkConflicts`, which asks Postgres
 * `start_time < :end AND end_time > :start` on the same day for the same
 * teacher or room). If the read side were more eager, the board would show
 * red for bookings the system happily accepts; if it were laxer, a center
 * would look at a clean week that is actually double-booked.
 */

const base: SchedulableSession = {
  id: "a",
  date: "2026-08-10T00:00:00.000Z",
  startTime: "14:00",
  endTime: "16:00",
  status: "scheduled",
  teacherId: "t1",
  roomId: "r1",
};
const s = (over: Partial<SchedulableSession> & { id: string }): SchedulableSession => ({
  ...base,
  ...over,
});

describe("timesOverlap — half-open, and the boundary everyone gets wrong", () => {
  it("back-to-back lessons do NOT clash (14:00–16:00 then 16:00–18:00)", () => {
    expect(
      timesOverlap({ startTime: "14:00", endTime: "16:00" }, { startTime: "16:00", endTime: "18:00" }),
    ).toBe(false);
  });

  it("one minute of overlap DOES clash", () => {
    expect(
      timesOverlap({ startTime: "14:00", endTime: "16:01" }, { startTime: "16:00", endTime: "18:00" }),
    ).toBe(true);
  });

  it("is symmetric", () => {
    const a = { startTime: "14:00", endTime: "16:00" };
    const b = { startTime: "15:00", endTime: "17:00" };
    expect(timesOverlap(a, b)).toBe(timesOverlap(b, a));
  });

  it("a fully contained session clashes", () => {
    expect(
      timesOverlap({ startTime: "14:00", endTime: "18:00" }, { startTime: "15:00", endTime: "16:00" }),
    ).toBe(true);
  });

  it("compares a zero-padded 24-hour clock correctly (09:00 < 10:00)", () => {
    expect(
      timesOverlap({ startTime: "09:00", endTime: "10:00" }, { startTime: "10:00", endTime: "11:00" }),
    ).toBe(false);
    expect(
      timesOverlap({ startTime: "09:00", endTime: "11:00" }, { startTime: "10:00", endTime: "12:00" }),
    ).toBe(true);
  });
});

describe("findScheduleClashes", () => {
  it("flags a double-booked ROOM", () => {
    const out = findScheduleClashes([
      s({ id: "a" }),
      s({ id: "b", teacherId: "t2", startTime: "15:00", endTime: "17:00" }),
    ]);
    expect(out).toEqual([{ sessionId: "a", otherSessionId: "b", on: "room" }]);
  });

  it("flags a teacher in two places at once, even in different rooms", () => {
    const out = findScheduleClashes([
      s({ id: "a" }),
      s({ id: "b", roomId: "r2", startTime: "15:00", endTime: "17:00" }),
    ]);
    expect(out).toEqual([{ sessionId: "a", otherSessionId: "b", on: "teacher" }]);
  });

  it("reports ROOM first when a pair clashes on both — the hall is the urgent one", () => {
    const out = findScheduleClashes([s({ id: "a" }), s({ id: "b", startTime: "15:00" })]);
    expect(out[0].on).toBe("room");
  });

  it("does not flag different rooms with different teachers", () => {
    expect(
      findScheduleClashes([s({ id: "a" }), s({ id: "b", teacherId: "t2", roomId: "r2" })]),
    ).toEqual([]);
  });

  it("does not flag the same room on DIFFERENT days", () => {
    expect(
      findScheduleClashes([s({ id: "a" }), s({ id: "b", date: "2026-08-11T00:00:00.000Z" })]),
    ).toEqual([]);
  });

  it("ignores cancelled and completed sessions — a cancelled lesson frees its hall", () => {
    expect(
      findScheduleClashes([s({ id: "a" }), s({ id: "b", status: "cancelled" })]),
    ).toEqual([]);
    expect(
      findScheduleClashes([s({ id: "a" }), s({ id: "b", status: "completed" })]),
    ).toEqual([]);
  });

  it("includes POSTPONED, exactly as the write gate does", () => {
    expect(
      findScheduleClashes([s({ id: "a", status: "postponed" }), s({ id: "b" })]),
    ).toHaveLength(1);
  });

  it("two roomless sessions do not clash on a null room (only on their teacher)", () => {
    // A teacher-direct group has no hall. Two of them sharing `null` must not
    // read as one double-booked room.
    const out = findScheduleClashes([
      s({ id: "a", roomId: null }),
      s({ id: "b", roomId: null, teacherId: "t2" }),
    ]);
    expect(out).toEqual([]);
  });

  it("still catches the same teacher when neither session has a room", () => {
    const out = findScheduleClashes([
      s({ id: "a", roomId: null }),
      s({ id: "b", roomId: null, startTime: "15:00" }),
    ]);
    expect(out).toEqual([{ sessionId: "a", otherSessionId: "b", on: "teacher" }]);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const out = findScheduleClashes([
      s({ id: "a", date: new Date("2026-08-10T00:00:00.000Z") }),
      s({ id: "b", startTime: "15:00" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("reports each clashing PAIR once, not twice", () => {
    const out = findScheduleClashes([s({ id: "a" }), s({ id: "b", startTime: "15:00" })]);
    expect(out).toHaveLength(1);
  });

  it("handles a three-way pile-up as three pairs", () => {
    const out = findScheduleClashes([
      s({ id: "a" }),
      s({ id: "b", startTime: "14:30" }),
      s({ id: "c", startTime: "15:00" }),
    ]);
    expect(out).toHaveLength(3);
  });

  it("is empty for an empty week", () => {
    expect(findScheduleClashes([])).toEqual([]);
  });
});

describe("clashingSessionIds", () => {
  it("returns every id involved, for colouring cells", () => {
    const ids = clashingSessionIds([
      s({ id: "a" }),
      s({ id: "b", startTime: "15:00" }),
      s({ id: "c", date: "2026-08-12T00:00:00.000Z" }),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
