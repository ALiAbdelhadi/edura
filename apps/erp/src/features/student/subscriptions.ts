/**
 * ONE reading of "is my subscription still good", shared by the three surfaces
 * that ask it: the home alert, the subscriptions page, and the state chip on a
 * subject row.
 *
 * ── WHY THIS MODULE EXISTS AT ALL ─────────────────────────────────────────
 *
 * Before it, nothing in the student portal read `GET /api/v1/me/subscriptions`.
 * The endpoint has been shipping since Step 4 — student- and parent-scoped,
 * with the coverage window on every row — and no screen consumed it, so the
 * question "اشتراكي خلص ولا لسه؟" had no answer anywhere in the product. A
 * monthly plan is documented as manual-renewal, the expiry cron flips it to
 * `expired`, there is no reminder job, and the student found out by being
 * turned away at a counter.
 *
 * This module reads that endpoint's rows and nothing else. It computes no
 * price, writes nothing, and grants nothing: renewal goes through the existing
 * Subjects checkout, which is the one money path.
 *
 * ── WHAT IT REFUSES TO GUESS ──────────────────────────────────────────────
 *
 * A `per_session` pass covers ONE dated session, and the row carries only that
 * session's id — not its date. So a per-session pass gets no countdown, and
 * says what it is instead. Inventing "expires today" from a plan that has no
 * window would be a statement about someone's access that the data does not
 * support.
 */

export type SubscriptionRow = {
  id: string;
  courseId: string;
  subjectId: string | null;
  plan: "monthly" | "per_session";
  status: "pending_payment" | "active" | "expired" | "cancelled";
  price: number;
  periodStart: string | null;
  periodEnd: string | null;
  sessionId: string | null;
  createdAt: string;
  course: { id: string; title: string; location: string | null } | null;
};

/** Inside this many days of `periodEnd`, a live subscription starts warning. */
export const EXPIRING_WITHIN_DAYS = 7;

/**
 * A lapse older than this stops being news. Without it the home alert would be
 * permanent for anyone who ever let a subscription run out — and a banner that
 * never clears is a banner nobody reads.
 */
export const LAPSED_STAYS_NEWS_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionState =
  /** Live, with room to spare. `daysLeft` is null for a per-session pass. */
  | { kind: "active"; daysLeft: number | null }
  /** Live, but inside the warning window. */
  | { kind: "expiring"; daysLeft: number }
  /** The window has closed — whether or not the expiry sweep has run yet. */
  | { kind: "lapsed"; daysAgo: number | null }
  /** Checkout was started and never paid. */
  | { kind: "pending" }
  | { kind: "cancelled" };

/** Whole days from `now` to `end`, rounded up: "today" is 0, "tomorrow" is 1. */
function daysUntil(end: Date, now: Date): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
}

/**
 * The state of one subscription.
 *
 * `active` with a `periodEnd` in the past is read as LAPSED, deliberately: the
 * status column is only as fresh as the last cron run, and the coverage window
 * is the fact. Telling a student they are covered because a sweep has not run
 * yet is the one error here with a cost at the counter.
 */
export function stateOf(sub: SubscriptionRow, now: Date = new Date()): SubscriptionState {
  if (sub.status === "cancelled") return { kind: "cancelled" };
  if (sub.status === "pending_payment") return { kind: "pending" };

  const end = sub.periodEnd ? new Date(sub.periodEnd) : null;

  if (sub.status === "expired") {
    return { kind: "lapsed", daysAgo: end ? -daysUntil(end, now) : null };
  }

  // status === "active"
  if (!end) {
    // A per-session pass, or a monthly row with no window recorded. Neither can
    // be counted down; both are still live.
    return { kind: "active", daysLeft: null };
  }

  const left = daysUntil(end, now);
  if (left < 0) return { kind: "lapsed", daysAgo: -left };
  if (left <= EXPIRING_WITHIN_DAYS) return { kind: "expiring", daysLeft: left };
  return { kind: "active", daysLeft: left };
}

/** Still covering something the student can attend. */
export function isLive(state: SubscriptionState): boolean {
  return state.kind === "active" || state.kind === "expiring" || state.kind === "pending";
}

/**
 * The one subscription worth interrupting the home screen for, or null.
 *
 * Soonest first, and a lapse that is already two weeks old is not news. Only
 * ONE is returned: a home screen that stacks four renewal banners has stopped
 * being a home screen.
 */
export function mostUrgent(
  subs: SubscriptionRow[],
  now: Date = new Date(),
): { sub: SubscriptionRow; state: SubscriptionState } | null {
  const candidates = subs
    .map((sub) => ({ sub, state: stateOf(sub, now) }))
    .filter(({ state }) => {
      if (state.kind === "expiring") return true;
      if (state.kind === "lapsed") {
        return state.daysAgo !== null && state.daysAgo <= LAPSED_STAYS_NEWS_DAYS;
      }
      return false;
    })
    .sort((a, b) => rank(a.state) - rank(b.state));

  return candidates[0] ?? null;
}

/** Lapsed outranks expiring; inside each, the nearer date first. */
function rank(state: SubscriptionState): number {
  if (state.kind === "lapsed") return -1000 + (state.daysAgo ?? 0);
  if (state.kind === "expiring") return state.daysLeft;
  return 1000;
}

/**
 * A DIFFERENT order from `rank`, and deliberately so.
 *
 * `rank` answers "what should interrupt the home screen", where a lapse is the
 * loudest thing there is. A chip on a subject row answers "can I attend this",
 * where a live subscription is the truth even if the student also has a lapsed
 * row from three months ago sitting behind it. Sorting a chip by urgency would
 * label a renewed subject "خلص".
 */
function chipRank(state: SubscriptionState): number {
  switch (state.kind) {
    case "expiring":
      return 0;
    case "active":
      return 1;
    case "pending":
      return 2;
    case "lapsed":
      return 3;
    case "cancelled":
      return 4;
  }
}

/**
 * Subject id → its most relevant subscription state, for the chips on the
 * Subjects list. A subject the student holds two subscriptions for shows the
 * LIVE one; `subjectId` is a nullable snapshot, so rows without it are simply
 * not represented rather than being attached to a guess.
 */
export function stateBySubject(
  subs: SubscriptionRow[],
  now: Date = new Date(),
): Map<string, SubscriptionState> {
  const out = new Map<string, SubscriptionState>();
  for (const sub of subs) {
    if (!sub.subjectId) continue;
    const state = stateOf(sub, now);
    const held = out.get(sub.subjectId);
    if (!held || chipRank(state) < chipRank(held)) out.set(sub.subjectId, state);
  }
  return out;
}
