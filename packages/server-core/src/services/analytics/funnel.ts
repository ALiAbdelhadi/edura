import { ANALYTICS_EVENTS } from "@repo/observability";
import type { SessionLike } from "@repo/observability";
import { platformDb } from "../../db/scope";
import { captureServerEvent } from "./posthog-server";

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

export async function trackFirstGroup(
  actor: SessionLike,
  scope: { centerId?: string | null; teacherId?: string | null },
): Promise<void> {
  try {
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
