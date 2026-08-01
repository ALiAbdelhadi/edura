import { ANALYTICS_EVENTS } from "@repo/observability";
import type { SessionLike } from "@repo/observability";
import { platformDb } from "../../db/scope";
import { captureServerEvent } from "./posthog-server";

// =============================================================================
// The "first X" activation steps.
//
// "FIRST" IS COMPUTED, NOT ASSUMED. The naive version fires on every add and
// lets PostHog sort it out; PostHog cannot, and a funnel where step 3 has more
// events than step 2 is worse than no funnel. So each helper counts the rows
// and reports only when the count is exactly 1 — the row it just created.
//
// The count runs AFTER the write has committed, on paths that happen a handful
// of times per center in its lifetime. This is not a hot path.
//
// Every function here NEVER THROWS: they are called after committed writes.
// =============================================================================

/**
 * A center or teacher took on their first collaborating teacher.
 *
 * Counted on ACCEPTANCE, not on the request — a request that was never accepted
 * is not activation, and counting it would make the funnel look healthier than
 * the business is.
 */
export async function trackFirstTeacher(
  actor: SessionLike,
  centerId: string | null | undefined,
): Promise<void> {
  if (!centerId) return;
  try {
    const count = await platformDb((tx) =>
      tx.collaborationRequest.count({ where: { centerId, status: "accepted" } }),
    );
    if (count !== 1) return;
    await captureServerEvent(actor, ANALYTICS_EVENTS.FIRST_TEACHER_ADDED);
  } catch (err) {
    logFailure("first_teacher_added", err);
  }
}

/** The center or teacher created their first course/group. */
export async function trackFirstGroup(
  actor: SessionLike,
  scope: { centerId?: string | null; teacherId?: string | null },
): Promise<void> {
  try {
    // Teacher-direct courses have a NULL centerId (roadmap decision #2), so the
    // scope is whichever one identifies the owner — never both.
    const where = scope.centerId
      ? { centerId: scope.centerId }
      : scope.teacherId
        ? { teacherId: scope.teacherId, centerId: null }
        : null;
    if (!where) return;

    const count = await platformDb((tx) => tx.course.count({ where }));
    if (count !== 1) return;
    await captureServerEvent(actor, ANALYTICS_EVENTS.FIRST_GROUP_CREATED);
  } catch (err) {
    logFailure("first_group_created", err);
  }
}

/**
 * The first student joined this center's roster.
 *
 * The STUDENT is the object here, never the subject: the event is attributed to
 * the center actor who added them, and carries no student id. A minor is not
 * tracked by being enrolled.
 */
export async function trackFirstStudent(
  actor: SessionLike,
  centerId: string | null | undefined,
): Promise<void> {
  if (!centerId) return;
  try {
    const count = await platformDb((tx) => tx.enrollment.count({ where: { centerId } }));
    if (count !== 1) return;
    await captureServerEvent(actor, ANALYTICS_EVENTS.FIRST_STUDENT_ADDED);
  } catch (err) {
    logFailure("first_student_added", err);
  }
}

/**
 * The first payment this center or teacher ever received.
 *
 * Attributed to the PAYEE (the center/teacher whose business activated), not to
 * whoever paid — which is both the more useful business question and the reason
 * this step needs no student attribution at all.
 *
 * Takes the RECEIPT NUMBER rather than a bag of ids, for the same reason
 * `sendPaymentReceiptEmail` does: the Payment row is the single record of what
 * actually settled, and `payment_intents` has no `teacher_id`, so deriving the
 * payee from the intent would silently miss every teacher-direct course.
 */
export async function trackFirstPayment(
  receiptNumber: string,
  method: "card" | "wallet" | "cash",
): Promise<void> {
  try {
    const payment = await platformDb((tx) =>
      tx.payment.findUnique({
        where: { receiptNumber },
        select: { centerId: true, courseId: true, amount: true, status: true },
      }),
    );
    if (!payment || payment.status !== "paid" || payment.amount <= 0) return;

    // Teacher-direct courses carry a NULL centerId; the payee is the teacher.
    const teacherUserId =
      !payment.centerId && payment.courseId
        ? (
            await platformDb((tx) =>
              tx.course.findUnique({
                where: { id: payment.courseId! },
                select: { teacherId: true },
              }),
            )
          )?.teacherId
        : null;

    const where = payment.centerId
      ? { centerId: payment.centerId }
      : teacherUserId
        ? { centerId: null, course: { teacherId: teacherUserId } }
        : null;
    if (!where) return;

    const count = await platformDb((tx) =>
      tx.payment.count({ where: { ...where, status: "paid", amount: { gt: 0 } } }),
    );
    if (count !== 1) return;

    // The payee is the subject of this event.
    const actor: SessionLike | null = payment.centerId
      ? { id: payment.centerId, role: "center_admin", centerId: payment.centerId }
      : teacherUserId
        ? { id: teacherUserId, role: "teacher" }
        : null;
    if (!actor) return;

    await captureServerEvent(actor, ANALYTICS_EVENTS.FIRST_PAYMENT_COMPLETED, {
      amount_piasters: payment.amount,
      currency: "EGP",
      payment_method: method,
    });
  } catch (err) {
    logFailure("first_payment_completed", err);
  }
}

function logFailure(event: string, err: unknown): void {
  console.error(`[analytics] ${event}: ${err instanceof Error ? err.message : String(err)}`);
}
