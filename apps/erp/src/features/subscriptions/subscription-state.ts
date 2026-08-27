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

export const EXPIRING_WITHIN_DAYS = 7;

export const LAPSED_STAYS_NEWS_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionState =
  | { kind: "active"; daysLeft: number | null }
  | { kind: "expiring"; daysLeft: number }
  | { kind: "lapsed"; daysAgo: number | null }
  | { kind: "pending" }
  | { kind: "cancelled" };

function daysUntil(end: Date, now: Date): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
}

export function stateOf(sub: SubscriptionRow, now: Date = new Date()): SubscriptionState {
  if (sub.status === "cancelled") return { kind: "cancelled" };
  if (sub.status === "pending_payment") return { kind: "pending" };

  const end = sub.periodEnd ? new Date(sub.periodEnd) : null;

  if (sub.status === "expired") {
    return { kind: "lapsed", daysAgo: end ? -daysUntil(end, now) : null };
  }

  if (!end) {
    return { kind: "active", daysLeft: null };
  }

  const left = daysUntil(end, now);
  if (left < 0) return { kind: "lapsed", daysAgo: -left };
  if (left <= EXPIRING_WITHIN_DAYS) return { kind: "expiring", daysLeft: left };
  return { kind: "active", daysLeft: left };
}

export function isLive(state: SubscriptionState): boolean {
  return state.kind === "active" || state.kind === "expiring" || state.kind === "pending";
}

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

function rank(state: SubscriptionState): number {
  if (state.kind === "lapsed") return -1000 + (state.daysAgo ?? 0);
  if (state.kind === "expiring") return state.daysLeft;
  return 1000;
}

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
