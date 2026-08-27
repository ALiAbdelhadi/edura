import { describe, expect, it } from "vitest";
import {
  EXPIRING_WITHIN_DAYS,
  LAPSED_STAYS_NEWS_DAYS,
  isLive,
  mostUrgent,
  stateBySubject,
  stateOf,
  type SubscriptionRow,
} from "@/features/subscriptions/subscription-state";

const NOW = new Date("2026-08-20T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function row(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "s1",
    courseId: "c1",
    subjectId: "subj-1",
    plan: "monthly",
    status: "active",
    price: 30000,
    periodStart: at(-20),
    periodEnd: at(10),
    sessionId: null,
    createdAt: at(-20),
    course: { id: "c1", title: "الكيمياء", location: null },
    ...over,
  };
}

describe("stateOf — the window is the fact, the status column is only as fresh as the cron", () => {
  it("reads a comfortable window as active, with the days left", () => {
    expect(stateOf(row({ periodEnd: at(10) }), NOW)).toEqual({ kind: "active", daysLeft: 10 });
  });

  it("warns inside the seven-day window", () => {
    expect(stateOf(row({ periodEnd: at(3) }), NOW)).toEqual({ kind: "expiring", daysLeft: 3 });
  });

  it("treats the boundary day itself as expiring, not as comfortable", () => {
    const state = stateOf(row({ periodEnd: at(EXPIRING_WITHIN_DAYS) }), NOW);
    expect(state.kind).toBe("expiring");
  });

  it("LAPSES a row still marked active whose window has closed", () => {
    expect(stateOf(row({ status: "active", periodEnd: at(-2) }), NOW)).toEqual({
      kind: "lapsed",
      daysAgo: 2,
    });
  });

  it("reads an expired row as lapsed even when it carries no window", () => {
    expect(stateOf(row({ status: "expired", periodEnd: null }), NOW)).toEqual({
      kind: "lapsed",
      daysAgo: null,
    });
  });

  it("gives a per-session pass NO countdown, because the row carries no date", () => {
    const state = stateOf(
      row({ plan: "per_session", periodEnd: null, sessionId: "sess-1" }),
      NOW,
    );
    expect(state).toEqual({ kind: "active", daysLeft: null });
  });

  it("keeps pending and cancelled distinct from both live and lapsed", () => {
    expect(stateOf(row({ status: "pending_payment" }), NOW).kind).toBe("pending");
    expect(stateOf(row({ status: "cancelled" }), NOW).kind).toBe("cancelled");
  });
});

describe("isLive — what the page splits 'running now' from 'past' on", () => {
  it("counts active, expiring and pending as live", () => {
    expect(isLive(stateOf(row({ periodEnd: at(30) }), NOW))).toBe(true);
    expect(isLive(stateOf(row({ periodEnd: at(2) }), NOW))).toBe(true);
    expect(isLive(stateOf(row({ status: "pending_payment" }), NOW))).toBe(true);
  });

  it("does not count lapsed or cancelled", () => {
    expect(isLive(stateOf(row({ periodEnd: at(-1) }), NOW))).toBe(false);
    expect(isLive(stateOf(row({ status: "cancelled" }), NOW))).toBe(false);
  });
});

describe("mostUrgent — what may interrupt the home screen", () => {
  it("returns nothing while everything is comfortably live", () => {
    expect(mostUrgent([row({ periodEnd: at(20) })], NOW)).toBeNull();
  });

  it("puts a lapse ahead of an expiry", () => {
    const expiring = row({ id: "a", periodEnd: at(2) });
    const lapsed = row({ id: "b", periodEnd: at(-1) });
    expect(mostUrgent([expiring, lapsed], NOW)?.sub.id).toBe("b");
  });

  it("returns the NEAREST expiry when nothing has lapsed", () => {
    const far = row({ id: "far", periodEnd: at(6) });
    const near = row({ id: "near", periodEnd: at(1) });
    expect(mostUrgent([far, near], NOW)?.sub.id).toBe("near");
  });

  it("stops nagging about a lapse that is no longer news", () => {
    const old = row({ periodEnd: at(-(LAPSED_STAYS_NEWS_DAYS + 1)) });
    expect(mostUrgent([old], NOW)).toBeNull();
  });

  it("returns at most one, never a stack", () => {
    const many = [at(1), at(2), at(3)].map((periodEnd, i) => row({ id: `r${i}`, periodEnd }));
    expect(mostUrgent(many, NOW)).not.toBeNull();
  });
});

describe("stateBySubject — the chip on a Subjects row", () => {
  it("shows the LIVE subscription when a lapsed one sits behind it", () => {
    const lapsed = row({ id: "old", periodEnd: at(-3) });
    const live = row({ id: "new", periodEnd: at(25) });
    expect(stateBySubject([lapsed, live], NOW).get("subj-1")).toEqual({
      kind: "active",
      daysLeft: 25,
    });
  });

  it("prefers an expiring one over a comfortable one for the same subject", () => {
    const comfy = row({ id: "a", periodEnd: at(25) });
    const soon = row({ id: "b", periodEnd: at(2) });
    expect(stateBySubject([comfy, soon], NOW).get("subj-1")?.kind).toBe("expiring");
  });

  it("attaches nothing for a row whose subjectId snapshot is null", () => {
    expect(stateBySubject([row({ subjectId: null })], NOW).size).toBe(0);
  });
});
