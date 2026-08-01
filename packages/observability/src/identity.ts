// =============================================================================
// WHO a third-party observability vendor is allowed to be told about.
//
// This file is the whole privacy boundary for Sentry and PostHog. It is
// dependency-free and imported from browser bundles, Node handlers and the edge
// alike, so the two apps × three runtimes × two vendors cannot disagree about
// it — the same reason chat-scope.ts is one module.
//
// TWO RULES, both binding:
//
// 1. IDs ONLY. Never a name, email, phone, address, national ID, or any free
//    text a human typed. An opaque UUID is enough to correlate an error with a
//    support ticket; a name in a vendor's index is a disclosure that cannot be
//    taken back.
//
// 2. MINORS ARE NOT IDENTIFIED AT ALL. Not by id, not pseudonymously. See
//    `isMinorRole` for why `student` is the whole answer.
// =============================================================================

export type ObservabilityRole =
  | "student"
  | "parent"
  | "teacher"
  | "assistant"
  | "center_admin"
  | "center_staff"
  | "super_admin"
  | "accountant";

export type SessionLike = {
  id: string;
  role: string;
  centerId?: string | null;
};

/**
 * DEFAULT-MINOR, applied to analytics.
 *
 * The platform's binding rule (CLAUDE.md, chat-minors.ts) is that a student is
 * an ADULT only with a `dateOfBirth` AND a `dateOfBirthVerifiedAt` AND age >= 18
 * — missing or unverified means minor. Analytics does not get to re-litigate
 * that with a cheaper test, and it deliberately does not even read the DOB
 * columns: the resulting "is this particular student 18?" query would be a new
 * reason to load a minor's birth date on every page view.
 *
 * So EVERY `student` is treated as a minor here. That is stricter than the chat
 * gate (which does check the columns and lets a verified adult student through),
 * and stricter is the correct direction for a third-party vendor. The cost is
 * that a handful of verified-adult students are analysed anonymously; that is
 * not a cost worth a birth-date lookup on the analytics path.
 */
export function isMinorRole(role: string): boolean {
  return role === "student";
}

export type ObservabilityIdentity = {
  /** Opaque user UUID. */
  id: string;
  role: string;
  /** Tenant, for "is this an outage for one center or everyone?". */
  centerId?: string;
};

/**
 * Shape a session into what a vendor may receive — or `null` when the answer is
 * "nothing about this person".
 *
 * `null` is not a failure and callers must not fall back to something weaker:
 * it means unidentified traffic, which for a minor is the intended state.
 */
export function observabilityIdentity(
  session: SessionLike | null | undefined,
): ObservabilityIdentity | null {
  if (!session?.id || !session.role) return null;
  if (isMinorRole(session.role)) return null;

  return {
    id: session.id,
    role: session.role,
    ...(session.centerId ? { centerId: session.centerId } : {}),
  };
}
