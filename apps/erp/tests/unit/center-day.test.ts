import { describe, expect, it } from "vitest";
import {
  awaitingSettlement,
  liveNow,
  platformNowHHMM,
  sessionDayKey,
  type CenterSession,
} from "@/features/admin/center-day";

const s = (over: Partial<CenterSession> = {}): CenterSession => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-08-20",
  startTime: "16:00",
  endTime: "18:00",
  status: "scheduled",
  distributedAt: null,
  ...over,
});

/** 2026-08-20 17:00 Cairo (UTC+3 in August) === 14:00Z. */
const AT_1700_CAIRO = new Date("2026-08-20T14:00:00.000Z");

describe("platformNowHHMM", () => {
  it("reads the Cairo wall clock, not the runner's zone", () => {
    expect(platformNowHHMM(AT_1700_CAIRO)).toBe("17:00");
  });

  it("zero-pads so a string compare is a time compare", () => {
    // 06:30 Cairo === 03:30Z. "6:30" would sort after "16:00"; "06:30" does not.
    expect(platformNowHHMM(new Date("2026-08-20T03:30:00.000Z"))).toBe("06:30");
  });
});

describe("sessionDayKey", () => {
  it("takes the day the string already states, crossing no timezone", () => {
    expect(sessionDayKey("2026-08-20T22:00:00.000Z")).toBe("2026-08-20");
  });
  it("is empty for nothing", () => {
    expect(sessionDayKey(null)).toBe("");
    expect(sessionDayKey(undefined)).toBe("");
  });
});

describe("liveNow", () => {
  const day = "2026-08-20";

  it("includes a lesson that has started and not ended", () => {
    expect(liveNow([s()], AT_1700_CAIRO, day)).toHaveLength(1);
  });

  it("excludes one that has not started yet", () => {
    expect(liveNow([s({ startTime: "18:00", endTime: "20:00" })], AT_1700_CAIRO, day)).toHaveLength(0);
  });

  it("excludes one that has already ended", () => {
    expect(liveNow([s({ startTime: "12:00", endTime: "14:00" })], AT_1700_CAIRO, day)).toHaveLength(0);
  });

  it("KEEPS a long lesson past its 45th minute", () => {
    // The reason this does not reuse `isHappeningNow`: that helper stops at
    // start+45min, which would empty a hall that is still occupied.
    const long = s({ startTime: "15:00", endTime: "19:00" });
    expect(liveNow([long], AT_1700_CAIRO, day)).toHaveLength(1);
  });

  it("excludes a cancelled lesson — it occupies nothing", () => {
    expect(liveNow([s({ status: "cancelled" })], AT_1700_CAIRO, day)).toHaveLength(0);
  });

  it("excludes another day's lesson at the same clock time", () => {
    expect(liveNow([s({ date: "2026-08-19" })], AT_1700_CAIRO, day)).toHaveLength(0);
  });

  it("treats a missing or inverted end time as NOT running", () => {
    // A hall wrongly shown busy sends an operator to the wrong room, so the
    // unusable case fails closed rather than open.
    expect(liveNow([s({ endTime: null })], AT_1700_CAIRO, day)).toHaveLength(0);
    expect(liveNow([s({ startTime: "16:00", endTime: "09:00" })], AT_1700_CAIRO, day)).toHaveLength(0);
  });

  it("takes the day it is GIVEN and never asks the clock itself", () => {
    // The third argument is required precisely so the answer cannot come from
    // anywhere else. Handed a day that is not the instant's, liveNow must use
    // the day — that is what makes the center portal's Cairo day authoritative
    // over whatever zone the browser is in.
    //
    // Before 2026-08-27 the parameter was optional and fell back to the UTC day
    // of `now`. At this instant — 00:30 Cairo on the 21st — that fallback would
    // have answered "2026-08-20" and blanked a board with a class still in it.
    const justAfterCairoMidnight = new Date("2026-08-20T21:30:00.000Z");
    const late = s({ date: "2026-08-21", startTime: "00:00", endTime: "02:00" });
    expect(liveNow([late], justAfterCairoMidnight, "2026-08-21")).toHaveLength(1);
  });

  it("cannot be called without a day — the UTC fallback is gone", () => {
    // A TYPE-level guard, asserted at runtime so it is visible in a test run.
    // TypeScript rejects `liveNow(x, now)` outright; `length` records that the
    // signature still declares three required parameters, so a default value
    // quietly reappearing (which type-checks fine) also trips this.
    expect(liveNow.length).toBe(3);
  });

  it("sorts by start time", () => {
    const a = s({ id: "a", startTime: "16:30", endTime: "19:00" });
    const b = s({ id: "b", startTime: "15:00", endTime: "19:00" });
    expect(liveNow([a, b], AT_1700_CAIRO, day).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("awaitingSettlement", () => {
  it("counts a completed lesson whose money never moved", () => {
    expect(awaitingSettlement([s({ status: "completed", distributedAt: null })])).toHaveLength(1);
  });

  it("does NOT count one already distributed", () => {
    expect(
      awaitingSettlement([s({ status: "completed", distributedAt: "2026-08-20T18:05:00.000Z" })]),
    ).toHaveLength(0);
  });

  it("does not count a lesson that has not been completed yet", () => {
    expect(awaitingSettlement([s({ status: "scheduled" })])).toHaveLength(0);
    expect(awaitingSettlement([s({ status: "cancelled" })])).toHaveLength(0);
  });

  it("puts the most recent first", () => {
    const older = s({ id: "old", date: "2026-08-17", status: "completed" });
    const newer = s({ id: "new", date: "2026-08-20", status: "completed" });
    expect(awaitingSettlement([older, newer]).map((x) => x.id)).toEqual(["new", "old"]);
  });
});
